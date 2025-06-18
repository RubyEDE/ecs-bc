import * as ts from 'typescript';

/**
 * TypeScript compiler for converting user-defined systems to JavaScript
 */
export class TypeScriptCompiler {
  private readonly compilerOptions: ts.CompilerOptions;

  constructor() {
    this.compilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      // Minimal compilation - just strip types
      strict: false,
      skipLibCheck: true,
      noLib: true, // Don't load any library files
      noResolve: true, // Don't resolve modules
      isolatedModules: true, // Treat each file as separate module
      esModuleInterop: true,
      allowJs: true,
      removeComments: false,
    };
  }

  /**
   * Compile TypeScript source code to JavaScript
   * @param source TypeScript source code
   * @param fileName Virtual filename for error reporting
   * @returns Compiled JavaScript code
   */
  compile(source: string, fileName: string = 'user-system.ts'): string {
    // Use simple transpilation without full type checking
    const result = ts.transpileModule(source, {
      compilerOptions: this.compilerOptions,
      fileName,
    });

    if (result.diagnostics && result.diagnostics.length > 0) {
      // Filter out library/global type errors since we're running in a sandbox
      const realErrors = result.diagnostics.filter(diagnostic => {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        return !message.includes('Cannot find global type') &&
               !message.includes('Cannot find name') &&
               !message.includes('Library') &&
               !message.includes('lib-');
      });

      if (realErrors.length > 0) {
        const errors = realErrors.map(diagnostic =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
        );
        throw new Error(`TypeScript transpilation failed:\n${errors.join('\n')}`);
      }
    }

    return result.outputText;
  }

  /**
   * Validate TypeScript syntax without compilation
   * @param source TypeScript source code
   * @returns Array of syntax errors (empty if valid)
   */
  validateSyntax(source: string): string[] {
    try {
      const sourceFile = ts.createSourceFile(
        'temp.ts',
        source,
        ts.ScriptTarget.ES2020,
        true
      );

      // Check for parse diagnostics
      const parseDiagnostics = (sourceFile as any).parseDiagnostics || [];
      return parseDiagnostics.map((diagnostic: ts.Diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      );
    } catch (error) {
      return [error instanceof Error ? error.message : 'Unknown syntax error'];
    }
  }
} 