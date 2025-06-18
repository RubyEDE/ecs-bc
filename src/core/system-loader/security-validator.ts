/**
 * Security configuration for user-defined systems
 */
export interface SecurityConfig {
  allowedGlobals: Set<string>;
  blockedPatterns: RegExp[];
  maxSourceLength: number;
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  allowedGlobals: new Set([
    'console',
    'Math',
    'Object',
    'Array',
    'String',
    'Number',
    'Boolean',
    'JSON',
    'undefined',
    'null',
  ]),
  blockedPatterns: [
    /Math\.random/,
    /Date\.now/,
    /new Date/,
    /setTimeout/,
    /setInterval/,
    /eval\s*\(/,
    /Function\s*\(/,
    /require\s*\(/,
    /import\s+/,
    /process\./,
    /global\./,
    /window\./,
    /document\./,
    /XMLHttpRequest/,
    /fetch\s*\(/,
    // Block arrow function expressions that access dangerous globals
    /=>\s*require/,
    /=>\s*process/,
    /=>\s*global/,
    // Block function declarations with dangerous content
    /function\s*\([^)]*\)\s*{[^}]*(?:require|process|global|eval)/,
    // Block decimal numbers (floating point literals)
    /\b\d+\.\d+\b/,
  ],
  maxSourceLength: 10000,
};

export class SecurityValidator {
  private readonly config: SecurityConfig;

  constructor(config: SecurityConfig = DEFAULT_SECURITY_CONFIG) {
    this.config = config;
  }

  /**
   * Validate TypeScript source code for security issues
   * @param source TypeScript source code
   * @throws Error if validation fails
   */
  validateSource(source: string): void {
    // Check source length
    if (source.length > this.config.maxSourceLength) {
      throw new Error(`Source code too long: ${source.length} > ${this.config.maxSourceLength}`);
    }

    // Check for blocked patterns
    for (const pattern of this.config.blockedPatterns) {
      if (pattern.test(source)) {
        throw new Error(`Blocked pattern detected: ${pattern.source}`);
      }
    }

    // Additional string-based validation
    this.validateStringPatterns(source);
  }

  /**
   * Validate source code using string-based pattern matching
   */
  private validateStringPatterns(source: string): void {
    // Remove comments and strings to avoid false positives
    const cleanSource = this.removeCommentsAndStrings(source);

    // Check for dangerous keywords in clean source
    const dangerousKeywords = [
      'require(',
      'import ',
      'eval(',
      'Function(',
      'setTimeout(',
      'setInterval(',
      'process.',
      'global.',
      'window.',
      'document.',
    ];

    for (const keyword of dangerousKeywords) {
      if (cleanSource.includes(keyword)) {
        throw new Error(`Dangerous keyword detected: ${keyword.trim()}`);
      }
    }

    // Check for suspicious patterns
    if (cleanSource.includes('__proto__')) {
      throw new Error('Prototype manipulation detected');
    }

    if (cleanSource.includes('constructor.constructor')) {
      throw new Error('Constructor access detected');
    }
  }

  /**
   * Remove comments and string literals from source code
   * This is a simple implementation that may not handle all edge cases
   */
  private removeCommentsAndStrings(source: string): string {
    let result = '';
    let inString = false;
    let inComment = false;
    let stringChar = '';
    let i = 0;

    while (i < source.length) {
      const char = source[i];
      const nextChar = source[i + 1];

      if (!inString && !inComment) {
        // Check for start of comment
        if (char === '/' && nextChar === '/') {
          inComment = true;
          i += 2;
          continue;
        }
        if (char === '/' && nextChar === '*') {
          inComment = true;
          i += 2;
          continue;
        }
        // Check for start of string
        if (char === '"' || char === "'" || char === '`') {
          inString = true;
          stringChar = char;
          i++;
          continue;
        }
        result += char;
      } else if (inString) {
        // Check for end of string
        if (char === stringChar && source[i - 1] !== '\\') {
          inString = false;
          stringChar = '';
        }
      } else if (inComment) {
        // Check for end of comment
        if (char === '\n') {
          inComment = false;
          result += char; // Keep newlines
        }
        if (char === '*' && nextChar === '/') {
          inComment = false;
          i += 2;
          continue;
        }
      }

      i++;
    }

    return result;
  }
} 