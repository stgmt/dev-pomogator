/**
 * Parser Factory
 *
 * Returns the appropriate parser for the detected language.
 */

import type { Language, Parser, ValidatorConfig } from "../types.js";
import { CSharpParser } from "./csharp-parser.js";
import { TypeScriptParser } from "./typescript-parser.js";
import { PythonParser } from "./python-parser.js";

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

export { CSharpParser } from "./csharp-parser.js";
export { TypeScriptParser } from "./typescript-parser.js";
export { PythonParser } from "./python-parser.js";

export default getParser;
