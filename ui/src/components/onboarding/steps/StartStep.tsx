import { Mail, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

/**
 * Welcome / choose-a-path screen (unnumbered). "Set up" advances the flow (the
 * container decides the next step); "Join an existing team" is stubbed.
 *
 * Cards are translucent so the orbiting-paperclip backdrop reads through them
 * (local flow, which skips the auth screens and leads with this screen).
 */
export function StartStep({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="flex flex-col items-center gap-9">
      <h1 className="text-center text-4xl font-semibold leading-10 tracking-tight text-foreground">
        {t("onboarding.start.welcome")}
      </h1>
      <div className="flex flex-wrap items-start justify-center gap-6">
        <StartOption
          icon={<PlusCircle className="size-11" strokeWidth={1.2} />}
          title={t("onboarding.start.setupTitle")}
          description={t("onboarding.start.setupDescription")}
          onClick={onSetup}
        />
        <StartOption
          icon={<Mail className="size-11" strokeWidth={1.2} />}
          title={t("onboarding.start.joinTitle")}
          description={t("onboarding.start.joinDescription")}
          onClick={() => {}}
          disabled
        />
      </div>
    </div>
  );
}

/** A square choice tile: icon, title and description all inside the card. */
function StartOption({
  icon,
  title,
  description,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-(--sz-360px) w-(--sz-360px) max-w-full flex-col items-center justify-center gap-6 rounded-2xl border border-border bg-card/95 px-6 text-center transition-colors",
        // Both tiles render identically per the comp — the stubbed "join" tile
        // is inert (disabled) but must NOT be dimmed, or it reads as broken and
        // lets the backdrop bleed through it.
        "hover:border-muted-foreground disabled:hover:border-border",
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex w-72 max-w-full flex-col gap-2">
        <span className="text-lg font-semibold leading-7 text-foreground">{title}</span>
        <span className="text-sm leading-relaxed text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}
