const fp = require("lodash/fp");
const { dirname } = require('path')
const { prepareConfig } = require("./config");
const { fulfillConfigExports } = require("./mapper");

// note: memoize uses the first argument as key, so programPath is ignored here, which is expected
const fulfillConfigs = fp.memoize((opts, programPath) =>
  fp.flow(
    x => JSON.parse(x),
    prepareConfig,
    fp.map(x => Object.assign({}, x, { programPath })),
    fp.map(fp.flow(fulfillConfigExports, x => [x.name, x])),
    fp.fromPairs
  )(opts)
);

let configs;

module.exports = babel => ({
  visitor: {
    Program(path, state) {
      configs = fulfillConfigs(JSON.stringify(state.opts), dirname(state.file.opts.filename));
    },
    ImportDeclaration(declaration) {
      const { types } = babel;
      const { specifiers } = declaration.node;

      if (specifiers.length === 0) {
        return;
      }

      const settings = configs[declaration.node.source.value];

      if (!settings) {
        return;
      }

      const importSpecifiers = specifiers.filter(
        spec =>
          spec.type === "ImportSpecifier" ||
          spec.type === "ImportDefaultSpecifier"
      );

      if (importSpecifiers.length !== specifiers.length) {
        return;
      }

      importSpecifiers.forEach(spec => {
        const { name } = spec.imported || spec.local;
        const moduleSettings = settings.exports[name];

        if (!moduleSettings) {
          throw new Error(
            `babel-plugin-direct-import: ${settings.name} does not contain module "${name}"`
          );
        }

        declaration.insertBefore(
          types.importDeclaration(
            [
              moduleSettings.local === "*"
                ? types.importNamespaceSpecifier(
                    types.identifier(spec.local.name)
                  )
                : moduleSettings.local === "default"
                  ? types.importDefaultSpecifier(
                      types.identifier(spec.local.name)
                    )
                  : types.importSpecifier(
                      types.identifier(spec.local.name),
                      types.identifier(moduleSettings.local)
                    )
            ],
            types.stringLiteral(moduleSettings.source)
          )
        );
      });

      declaration.remove();
    }
  }
});
