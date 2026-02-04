from typing import Annotated, Any

from pydantic import PlainValidator


def validate_boolean(value: Any) -> bool:  # noqa: FBT001
    valid_trues = ["True", "true", "1", "yes"]
    valid_falses = ["False", "false", "0", "no"]
    # Legacy flows/assets may serialize boolean-like fields with `null`/`None`.
    # Treat it as False so template updates don't hard-fail validation.
    if value is None:
        return False
    if value in valid_trues:
        return True
    if value in valid_falses:
        return False
    # Accept integer 0/1 (common JSON/DB representations).
    if value in (0, 1):
        return bool(value)
    if isinstance(value, bool):
        return value
    msg = "Value must be a boolean"
    raise ValueError(msg)


CoalesceBool = Annotated[bool, PlainValidator(validate_boolean)]
