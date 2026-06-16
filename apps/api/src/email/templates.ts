import Handlebars from "handlebars";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const templateDir = resolve(dirname(fileURLToPath(import.meta.url)), "../text/email");

const cache = new Map<string, { html: HandlebarsTemplateDelegate; text: HandlebarsTemplateDelegate }>();

async function loadTemplate(name: string) {
  if (cache.has(name)) return cache.get(name)!;

  const [htmlSrc, textSrc] = await Promise.all([
    readFile(resolve(templateDir, `${name}.html`), "utf8"),
    readFile(resolve(templateDir, `${name}.txt`), "utf8"),
  ]);

  const compiled = {
    html: Handlebars.compile(htmlSrc),
    text: Handlebars.compile(textSrc),
  };
  cache.set(name, compiled);
  return compiled;
}

export async function renderTemplate(name: string, data: Record<string, unknown>): Promise<{ html: string; text: string }> {
  const template = await loadTemplate(name);
  return { html: template.html(data), text: template.text(data) };
}
