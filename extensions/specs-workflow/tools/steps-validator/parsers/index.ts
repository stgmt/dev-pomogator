/**
 * Parser Factory
 *
 * Returns the appropriate parser for the detected language.
 */

import type { Language, Parser, ValidatorConfig } from "../types.ts";
import { CSharpParser } from "./csharp-parser.ts";
import { TypeScriptParser } from "./typescript-parser.ts";
import { PythonParser } from "./python-parser.ts";

/**
 * Get parser for the specified language
 */
export function getParser(language: Language, config: ValidatorConfig): Parser {
  switch (language) {
    case "csharp":
      return new CSharpParser(config);
    case "typescript":
      return new TypeScriptParser(config);
    case "python":
      return new PythonParser(config);
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}

export { CSharpParser } from "./csharp-parser.ts";
export { TypeScriptParser } from "./typescript-parser.ts";
export { PythonParser } from "./python-parser.ts";

export default getParser;
