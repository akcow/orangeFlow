import fs from "fs";
import path from "path";
import ts from "typescript";

type Finding = {
  decl: string;
  hook: string;
  ref: string;
};

function collectBindingNames(nameNode: ts.BindingName, names: string[]) {
  if (ts.isIdentifier(nameNode)) {
    names.push(nameNode.text);
    return;
  }

  if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
    nameNode.elements.forEach((element) => {
      if (ts.isBindingElement(element)) {
        collectBindingNames(element.name, names);
      }
    });
  }
}

function addBindingNamesToScope(nameNode: ts.BindingName, scope: Set<string>) {
  const names: string[] = [];
  collectBindingNames(nameNode, names);
  names.forEach((name) => scope.add(name));
}

function getHookCalleeName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  return null;
}

function collectFreeRefs(node: ts.Node, knownTopLevelNames: Set<string>) {
  const refs = new Set<string>();

  const visit = (current: ts.Node, scope: Set<string>) => {
    const isNestedFunction =
      current !== node &&
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current) || ts.isFunctionDeclaration(current));
    if (isNestedFunction) {
      const nestedScope = new Set(scope);
      current.parameters.forEach((param) => addBindingNamesToScope(param.name, nestedScope));
      if (ts.isFunctionDeclaration(current) && current.name) {
        nestedScope.add(current.name.text);
      }
      if (current.body) {
        ts.forEachChild(current.body, (child) => visit(child, nestedScope));
      }
      return;
    }

    if (ts.isVariableDeclaration(current)) {
      addBindingNamesToScope(current.name, scope);
    }

    if (ts.isIdentifier(current) && !scope.has(current.text) && knownTopLevelNames.has(current.text)) {
      refs.add(current.text);
    }

    ts.forEachChild(current, (child) => visit(child, scope));
  };

  visit(node, new Set());
  return refs;
}

function findUseMemoForwardRefs(filePath: string): Finding[] {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = sourceFile.statements.find(
    (statement) =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === "DoubaoVideoGeneratorLayout",
  );

  if (!component || !ts.isFunctionDeclaration(component) || !component.body) {
    throw new Error("DoubaoVideoGeneratorLayout component not found");
  }

  const declarationOrder = new Map<string, number>();
  component.body.statements.forEach((statement, index) => {
    if (!ts.isVariableStatement(statement)) {
      return;
    }

    statement.declarationList.declarations.forEach((declaration) => {
      const names: string[] = [];
      collectBindingNames(declaration.name, names);
      names.forEach((name) => declarationOrder.set(name, index));
    });
  });

  const knownTopLevelNames = new Set(declarationOrder.keys());
  const findings: Finding[] = [];

  component.body.statements.forEach((statement, index) => {
    if (!ts.isVariableStatement(statement)) {
      return;
    }

    statement.declarationList.declarations.forEach((declaration) => {
      const initializer = declaration.initializer;
      if (!initializer || !ts.isCallExpression(initializer)) {
        return;
      }

      const hookName = getHookCalleeName(initializer.expression);
      if (hookName !== "useMemo") {
        return;
      }

      const callback = initializer.arguments[0];
      const deps = initializer.arguments[1];

      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        for (const ref of collectFreeRefs(callback.body, knownTopLevelNames)) {
          if ((declarationOrder.get(ref) ?? -1) > index) {
            findings.push({ decl: declaration.name.getText(sourceFile), hook: hookName, ref });
          }
        }
      }

      if (deps && ts.isArrayLiteralExpression(deps)) {
        deps.elements.forEach((element) => {
          for (const ref of collectFreeRefs(element, knownTopLevelNames)) {
            if ((declarationOrder.get(ref) ?? -1) > index) {
              findings.push({ decl: declaration.name.getText(sourceFile), hook: `${hookName}.deps`, ref });
            }
          }
        });
      }
    });
  });

  return findings;
}

describe("DoubaoVideoGeneratorLayout TDZ regressions", () => {
  it("does not reference later declarations inside useMemo render-time code", () => {
    const targetFile = path.resolve(
      __dirname,
      "..",
      "DoubaoVideoGeneratorLayout.tsx",
    );

    expect(findUseMemoForwardRefs(targetFile)).toEqual([]);
  });
});
