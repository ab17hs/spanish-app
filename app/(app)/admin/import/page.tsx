import { ImportWizard } from "./import-wizard";

export const metadata = {
  title: "Import vocabulary",
};

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Import from Word</h1>
        <p className="mt-1 text-muted-foreground">
          Drop a .docx file with your curriculum. The parser will pull out vocab,
          grammar rules, and topic headings — you review everything before it lands
          in your library.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
