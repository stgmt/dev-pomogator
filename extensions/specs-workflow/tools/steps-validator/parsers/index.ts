/**
 * Parser Factory
 *
 * Returns the appropriate parser for the detected language.
 */

import type { Language, Parser, ValidatorConfig } from "../types";
import { CSharpParser } from "./csharp-parser";
import { TypeScriptParser } from "./typescript-parser";
import { PythonParser } from "./python-parser";

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

export { CSharpParser } from "./csharp-parser";
export { TypeScriptParser } from "./typescript-parser";
export { PythonParser } from "./python-parser";

export default getParser;
