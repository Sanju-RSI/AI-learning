const esbuild = require('esbuild');

module.exports = {
  process(sourceText, sourcePath) {
    const result = esbuild.transformSync(sourceText, {
      loader: 'ts',
      format: 'cjs',
      target: 'es2022',
      sourcefile: sourcePath,
    });

    return { code: result.code };
  },
};
