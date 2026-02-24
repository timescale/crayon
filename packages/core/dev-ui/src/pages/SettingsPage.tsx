import { DeployPanel } from "../components/DeployPanel";

export function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-8 py-8">
        <h1 className="text-3xl font-bold text-foreground font-serif">
          Settings
        </h1>
        <p className="text-muted-foreground mt-1 mb-6">
          Configure your project settings
        </p>

        <div className="bg-card rounded-xl border border-border p-5 max-w-md">
          <DeployPanel />
        </div>
      </div>
    </div>
  );
}
