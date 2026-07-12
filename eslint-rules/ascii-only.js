const nonAsciiRuns = () => /([^\t\n\x20-\x7e])\1*/gu;

const codePointHex = char => char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');

const asciiOnly = {
    meta: {
        type: 'problem',
        docs: {
            description: 'disallow characters outside tab, newline and printable ASCII (\\x20-\\x7e)'
        },
        schema: []
    },
    create(context) {
        return {
            Program() {
                const sourceCode = context.sourceCode;
                const text = sourceCode.getText();
                const pattern = nonAsciiRuns();
                let match = pattern.exec(text);
                while (match !== null) {
                    const run = match[0];
                    const start = match.index;
                    const end = start + run.length;
                    const hex = codePointHex(run);
                    context.report({
                        loc: {
                            start: sourceCode.getLocFromIndex(start),
                            end: sourceCode.getLocFromIndex(end)
                        },
                        message: `Character U+${hex} is not allowed in source files; write it as the escape sequence \\u${hex} instead of a literal character.`
                    });
                    match = pattern.exec(text);
                }
            }
        };
    }
};

export default asciiOnly;
