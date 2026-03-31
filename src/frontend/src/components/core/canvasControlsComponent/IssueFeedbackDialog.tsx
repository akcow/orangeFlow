import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Paperclip, Trash2, Video } from "lucide-react";
import { useCreateIssueFeedback } from "@/controllers/API/queries/feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import useAlertStore from "@/stores/alertStore";

type SelectedFile = {
  id: string;
  file: File;
  objectUrl: string;
};

const MAX_FILES = 10;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_DESCRIPTION_LENGTH = 8000;
const TEXT = {
  validationRequired: "\u8bf7\u5148\u8be6\u7ec6\u63cf\u8ff0\u9047\u5230\u7684\u95ee\u9898\u3002",
  validationDescriptionTooLong: `\u95ee\u9898\u63cf\u8ff0\u4e0d\u80fd\u8d85\u8fc7 ${MAX_DESCRIPTION_LENGTH} \u4e2a\u5b57\u7b26\u3002`,
  validationTooManyFiles: `\u5355\u6b21\u6700\u591a\u53ea\u80fd\u4e0a\u4f20 ${MAX_FILES} \u4e2a\u6587\u4ef6\u3002`,
  unsupportedAttachmentTitle: "\u4e0d\u652f\u6301\u7684\u9644\u4ef6\u7c7b\u578b",
  unsupportedAttachmentDetail: "\u53ea\u5141\u8bb8\u4e0a\u4f20\u56fe\u7247\u6216\u89c6\u9891\u6587\u4ef6\u3002",
  noFilesAddedTitle: "\u672a\u6dfb\u52a0\u65b0\u9644\u4ef6",
  submitSuccessTitle: "\u95ee\u9898\u53cd\u9988\u5df2\u63d0\u4ea4",
  submitSuccessDetail:
    "\u4f60\u7684\u53cd\u9988\u5df2\u53d1\u9001\u7ed9\u7ba1\u7406\u5458\uff0c\u540e\u7eed\u5904\u7406\u7ed3\u679c\u4f1a\u5728\u201c\u6211\u7684\u901a\u77e5\u201d\u4e2d\u5448\u73b0\u3002",
  submitFailedTitle: "\u63d0\u4ea4\u53cd\u9988\u5931\u8d25",
  submitFailedFallback: "\u53cd\u9988\u63d0\u4ea4\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  dialogTitle: "\u53cd\u9988\u95ee\u9898",
  dialogDescription:
    "\u8bf7\u5c3d\u91cf\u8be6\u7ec6\u63cf\u8ff0\u95ee\u9898\u73b0\u8c61\uff0c\u5305\u62ec\u64cd\u4f5c\u6b65\u9aa4\u3001\u9884\u671f\u7ed3\u679c\u3001\u5b9e\u9645\u7ed3\u679c\uff0c\u5e76\u53ef\u9644\u4e0a\u56fe\u7247\u6216\u89c6\u9891\u534f\u52a9\u7ba1\u7406\u5458\u5b9a\u4f4d\u95ee\u9898\u3002",
  detailsLabel: "\u95ee\u9898\u63cf\u8ff0",
  detailsPlaceholder:
    "\u8bf7\u8f93\u5165\u95ee\u9898\u51fa\u73b0\u7684\u9875\u9762\u3001\u64cd\u4f5c\u6b65\u9aa4\u3001\u62a5\u9519\u4fe1\u606f\uff0c\u4ee5\u53ca\u4efb\u4f55\u80fd\u5e2e\u52a9\u6211\u4eec\u590d\u73b0\u95ee\u9898\u7684\u4e0a\u4e0b\u6587\u3002",
  attachmentsLabel: "\u9644\u4ef6",
  attachmentsDescription:
    "\u53ea\u652f\u6301\u56fe\u7247\u548c\u89c6\u9891\uff0c\u5355\u6b21\u6700\u591a 10 \u4e2a\u6587\u4ef6\uff0c\u6bcf\u4e2a\u6587\u4ef6\u4e0d\u8d85\u8fc7 50MB\u3002",
  addFiles: "\u6dfb\u52a0\u9644\u4ef6",
  noAttachments: "\u6682\u672a\u9009\u62e9\u9644\u4ef6",
  cancel: "\u53d6\u6d88",
  sending: "\u63d0\u4ea4\u4e2d",
  submit: "\u63d0\u4ea4\u53cd\u9988",
} as const;

function humanFileSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isSupportedFile(file: File) {
  return file.type.startsWith("image/") || file.type.startsWith("video/");
}

function revokeFiles(files: SelectedFile[]) {
  files.forEach((item) => URL.revokeObjectURL(item.objectUrl));
}

export function IssueFeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedFilesRef = useRef<SelectedFile[]>([]);
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const [description, setDescription] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const { mutate: createIssueFeedback, isPending } = useCreateIssueFeedback();

  useEffect(() => {
    selectedFilesRef.current = selectedFiles;
  }, [selectedFiles]);

  const validationMessage = useMemo(() => {
    if (!description.trim()) return TEXT.validationRequired;
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return TEXT.validationDescriptionTooLong;
    }
    if (selectedFiles.length > MAX_FILES) {
      return TEXT.validationTooManyFiles;
    }

    const oversized = selectedFiles.find((item) => item.file.size > MAX_FILE_SIZE);
    if (oversized) {
      return `${oversized.file.name} \u8d85\u8fc7 50MB \u9650\u5236\u3002`;
    }

    return "";
  }, [description, selectedFiles]);

  useEffect(() => {
    if (!open) {
      setDescription("");
      setSelectedFiles((current) => {
        revokeFiles(current);
        return [];
      });
    }
  }, [open]);

  useEffect(() => {
    return () => {
      revokeFiles(selectedFilesRef.current);
    };
  }, []);

  function appendFiles(files: FileList | File[]) {
    const nextFiles = Array.from(files);
    const invalid = nextFiles.find((file) => !isSupportedFile(file));
    if (invalid) {
      setErrorData({
        title: TEXT.unsupportedAttachmentTitle,
        list: [TEXT.unsupportedAttachmentDetail],
      });
      return;
    }

    const combined = [...selectedFiles];
    for (const file of nextFiles) {
      if (combined.length >= MAX_FILES) break;

      const duplicate = combined.some(
        (item) =>
          item.file.name === file.name &&
          item.file.size === file.size &&
          item.file.lastModified === file.lastModified,
      );
      if (duplicate) continue;

      combined.push({
        id: `${file.name}-${file.lastModified}-${file.size}`,
        file,
        objectUrl: URL.createObjectURL(file),
      });
    }

    if (combined.length === selectedFiles.length && nextFiles.length > 0) {
      setErrorData({
        title: TEXT.noFilesAddedTitle,
        list: [TEXT.validationTooManyFiles],
      });
      return;
    }

    setSelectedFiles(combined.slice(0, MAX_FILES));
  }

  function removeFile(fileId: string) {
    setSelectedFiles((current) => {
      const target = current.find((item) => item.id === fileId);
      if (target) URL.revokeObjectURL(target.objectUrl);
      return current.filter((item) => item.id !== fileId);
    });
  }

  function handleSubmit() {
    if (validationMessage) {
      setErrorData({ title: validationMessage });
      return;
    }

    createIssueFeedback(
      {
        description: description.trim(),
        files: selectedFiles.map((item) => item.file),
      },
      {
        onSuccess: () => {
          setSuccessData({
            title: TEXT.submitSuccessTitle,
            list: [TEXT.submitSuccessDetail],
          });
          onOpenChange(false);
        },
        onError: (error: any) => {
          const detail =
            error?.response?.data?.detail ||
            error?.message ||
            TEXT.submitFailedFallback;

          setErrorData({
            title: TEXT.submitFailedTitle,
            list: typeof detail === "string" ? [detail] : undefined,
          });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{TEXT.dialogTitle}</DialogTitle>
          <DialogDescription>{TEXT.dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">{TEXT.detailsLabel}</div>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={TEXT.detailsPlaceholder}
              className="min-h-[160px]"
              maxLength={MAX_DESCRIPTION_LENGTH}
            />
            <div className="text-xs text-muted-foreground">
              {`${description.length} / ${MAX_DESCRIPTION_LENGTH}`}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">{TEXT.attachmentsLabel}</div>
                <div className="text-xs text-muted-foreground">{TEXT.attachmentsDescription}</div>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => inputRef.current?.click()}
                className="shrink-0"
              >
                <Paperclip className="mr-2 h-4 w-4" />
                {TEXT.addFiles}
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) {
                    appendFiles(event.target.files);
                    event.target.value = "";
                  }
                }}
              />
            </div>

            {selectedFiles.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {selectedFiles.map((item) => {
                  const isImage = item.file.type.startsWith("image/");
                  return (
                    <div
                      key={item.id}
                      className="overflow-hidden rounded-xl border border-border bg-muted/20"
                    >
                      <div className="relative aspect-[4/3] bg-black/80">
                        {isImage ? (
                          <img
                            src={item.objectUrl}
                            alt={item.file.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <video
                            src={item.objectUrl}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                          />
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          onClick={() => removeFile(item.id)}
                          className="absolute right-2 top-2 h-8 w-8 rounded-full bg-black/65 text-white hover:bg-black/80"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="space-y-1 px-3 py-3">
                        <div className="line-clamp-1 text-sm font-medium text-foreground">
                          {item.file.name}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {isImage ? (
                            <ImagePlus className="h-3.5 w-3.5" />
                          ) : (
                            <Video className="h-3.5 w-3.5" />
                          )}
                          <span>{humanFileSize(item.file.size)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                {TEXT.noAttachments}
              </div>
            )}
          </div>

          {validationMessage ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              {validationMessage}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {TEXT.cancel}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!!validationMessage || isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {TEXT.sending}
              </>
            ) : (
              TEXT.submit
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
