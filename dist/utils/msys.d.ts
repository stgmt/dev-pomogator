/**
 * Detect if a path looks like it was mangled by MSYS/Git Bash.
 * MSYS converts Unix paths like /home/user to C:/Program Files/Git/home/user
 */
export declare function isMsysMangledPath(p: string): boolean;
/**
 * Detect if running inside MSYS/Git Bash/Cygwin environment.
 */
export declare function detectMsysEnvironment(): boolean;
/**
 * Return environment with MSYS_NO_PATHCONV=1 and MSYS2_ARG_CONV_EXCL=*
 * to prevent MSYS path mangling. Only modifies on Windows; on other platforms
 * returns the base env unchanged.
 */
export declare function getMsysSafeEnv(baseEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
/**
 * Scan project root for directories that look like MSYS path mangling artifacts.
 * A directory named like "C:" (single letter + colon) in a project root is
 * almost certainly an artifact of MSYS converting /home/... to C:/Program Files/Git/...
 * which, on Linux, creates a literal "C:" directory.
 */
export declare function detectMangledArtifacts(projectRoot: string): string[];
//# sourceMappingURL=msys.d.ts.map