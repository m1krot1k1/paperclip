import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CompanySecret, UserSecretDefinition } from "@paperclipai/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { secretsApi } from "../../api/secrets";
import { ApiError } from "../../api/client";
import { queryKeys } from "../../lib/queryKeys";
import { useToastActions } from "../../context/ToastContext";
import { UserSecretChip } from "./user-secret-presentation";
import { useTranslation } from "../../i18n";

/**
 * Shared "set my value" dialog for a user-secret definition. Used both from the
 * Secrets → My secrets tab and from the missing-required-secret warning surfaces
 * (task run / issue failure), so a user can satisfy a required secret from either
 * place with identical behavior.
 */
export function SetMyUserSecretDialog({
  companyId,
  definition,
  existingSecret,
  open,
  onOpenChange,
  onSaved,
}: {
  companyId: string;
  definition: UserSecretDefinition | null;
  existingSecret?: CompanySecret | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (secret: CompanySecret) => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const [value, setValue] = useState("");
  const [externalRef, setExternalRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const isExternal = definition?.managedMode === "external_reference";

  useEffect(() => {
    if (open) {
      setValue("");
      setExternalRef("");
      setError(null);
    }
  }, [open, definition?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!definition) throw new Error("No definition selected");
      const payload = isExternal
        ? { externalRef: externalRef.trim() }
        : { value: value.trim() };
      if (existingSecret) {
        // A stored value already exists → rotate it in place.
        return secretsApi.rotateMyUserSecret(companyId, existingSecret.id, payload);
      }
      return secretsApi.createMyUserSecret(companyId, {
        definitionId: definition.id,
        definitionKey: definition.key,
        ...payload,
      });
    },
    onSuccess: (secret) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.secrets.myUserSecrets(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.secrets.userDefinitions(companyId) });
      pushToast({
        title: existingSecret ? t("secrets.valueUpdated") : t("secrets.valueSaved"),
        body: definition?.name,
        tone: "success",
      });
      onSaved?.(secret);
      onOpenChange(false);
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("secrets.failedSaveValue"),
      );
    },
  });

  const canSave = isExternal ? externalRef.trim().length > 0 : value.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {existingSecret ? t("secrets.updateYourValue") : t("secrets.setYourValue")}
            <UserSecretChip />
          </DialogTitle>
          <DialogDescription>
            {definition ? (
              <>
                {t("secrets.valueDescription", { key: definition.key })}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {definition ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/20 p-3 text-xs">
              <div className="font-medium text-foreground">{definition.name}</div>
              {definition.description ? (
                <p className="mt-1 text-muted-foreground">{definition.description}</p>
              ) : null}
              {definition.usageGuidance ? (
                <p className="mt-1 text-muted-foreground">{definition.usageGuidance}</p>
              ) : null}
            </div>

            {isExternal ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">{t("secrets.externalReference")}</label>
                <Input
                  value={externalRef}
                  onChange={(event) => setExternalRef(event.target.value)}
                  placeholder={t("secrets.externalReferencePlaceholder")}
                  className="font-mono text-sm"
                  autoFocus
                />
                <p className="text-(length:--text-micro) text-muted-foreground">
                  {t("secrets.externalReferenceDescription")}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">{t("secrets.yourValue")}</label>
                <Textarea
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={t("secrets.valuePlaceholder")}
                  className="font-mono text-sm min-h-(--sz-80px)"
                  autoFocus
                />
                <p className="text-(length:--text-micro) text-muted-foreground">
                  {t("secrets.encryptedValueDescription")}
                </p>
              </div>
            )}

            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {t("secrets.cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
            {save.isPending ? t("common.loading") : existingSecret ? t("secrets.updateValue") : t("secrets.saveValue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
