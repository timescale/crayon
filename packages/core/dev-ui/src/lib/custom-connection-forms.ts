export interface CustomFormField {
  name: string;
  label: string;
  type: "text" | "password" | "select";
  required: boolean;
  defaultValue?: string;
  placeholder?: string;
  options?: string[];
  /** true = stored in Nango credentials, false = stored in connection_config */
  isCredential: boolean;
}

export interface CustomFormConfig {
  fields: CustomFormField[];
  /** Parse a connection string into individual field values */
  parseConnectionString?: (url: string) => Record<string, string>;
  /** Generate the Nango connection_id (internal, not user-facing) */
  connectionIdTemplate: (values: Record<string, string>) => string;
}

export const CUSTOM_FORM_INTEGRATIONS: Record<string, CustomFormConfig> = {
  postgres: {
    fields: [
      { name: "host", label: "Host", type: "text", required: true, placeholder: "db.example.com", isCredential: false },
      { name: "port", label: "Port", type: "text", required: true, defaultValue: "5432", placeholder: "5432", isCredential: false },
      { name: "database", label: "Database", type: "text", required: true, placeholder: "mydb", isCredential: false },
      { name: "username", label: "Username", type: "text", required: true, placeholder: "postgres", isCredential: true },
      { name: "password", label: "Password", type: "password", required: true, isCredential: true },
      { name: "sslmode", label: "SSL Mode", type: "select", required: false, defaultValue: "require", isCredential: false, options: ["disable", "require", "verify-ca", "verify-full"] },
      { name: "nickname", label: "Nickname", type: "text", required: false, placeholder: "e.g. Production DB", isCredential: false },
    ],
    parseConnectionString: (url: string) => {
      const parsed = new URL(url);
      return {
        host: parsed.hostname,
        port: parsed.port || "5432",
        database: parsed.pathname.slice(1),
        username: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        sslmode: parsed.searchParams.get("sslmode") || "require",
      };
    },
    connectionIdTemplate: () => crypto.randomUUID(),
  },
};

export function hasCustomForm(integrationId: string): boolean {
  return integrationId in CUSTOM_FORM_INTEGRATIONS;
}
