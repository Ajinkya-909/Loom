import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";

function extractCode(children: ReactNode): { code: string; lang?: string | undefined } | null {
  for (const child of Children.toArray(children)) {
    if (isValidElement(child)) {
      const props = child.props as { className?: string; children?: ReactNode };
      const lang = /language-([\w-]+)/.exec(props.className ?? "")?.[1];
      const raw = props.children;
      const code =
        typeof raw === "string"
          ? raw
          : Array.isArray(raw) && raw.every((r) => typeof r === "string")
            ? raw.join("")
            : null;
      if (code !== null) return { code, lang };
    }
  }
  return null;
}

const components: Components = {
  pre: ({ children }) => {
    const extracted = extractCode(children);
    if (extracted) {
      return <CodeBlock code={extracted.code} lang={extracted.lang} />;
    }
    return <pre className="overflow-x-auto rounded-xl bg-secondary p-4">{children}</pre>;
  },
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
