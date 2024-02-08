const yaml = require("js-yaml");
const fs = require("fs").promises;

module.exports = async function (source) {
  const value = yaml.load(await fs.readFile(source, "utf8"));
  const allPlugins = (value.plugins || []).map((p) => {
    return {
      parent: null,
      parentRef: null,
      plugin: p,
    };
  });

  for (const service of value.services) {
    const { plugins: servicePlugins, routes } = addService(service);

    for (let plugin of servicePlugins) {
      addPlugin(plugin, "service", name(service.name));
    }

    for (const route of routes) {
      const { plugins: routePlugins } = addRoute(route, name(service.name));
      for (let plugin of routePlugins) {
        addPlugin(plugin, "route", name(route.name));
      }
    }

    //console.log(servicePlugins);
  }
};

module.exports("./kong.yaml");
function name(s) {
  return s.replace(/\-/g, "_");
}

function outputResource(type, values, relationships = {}, nameOverride = null) {
  let str = ``;

  if (!nameOverride) {
    nameOverride = name(values.name);
  }

  str += `resource "${type}" "${nameOverride}" {\n`;

  for (let k in values) {
    if (type.includes("plugin") && k === "name") {
      continue;
    }

    // TODO: Tag support
    if (["id", "plugins", "routes", "tags"].includes(k)) {
      continue;
    }
    if (typeof values[k] === "object" && !Array.isArray(values[k])) {
      //throw new Error("Unable to process " + k);
    }

    if (Array.isArray(values[k])) {
      str += `  ${k} = ${JSON.stringify(values[k])}\n`;
    } else if (typeof values[k] === "object") {
      str += outputNestedObject({
        [k]: values[k],
      });
    } else {
      str += `  ${k} = "${values[k]}"\n`;
    }
  }

  // Any entity relationships?
  for (let r in relationships) {
    str += `\n  ${r} = { \n    id = konnect_${r}.${relationships[r]}.id\n  }\n\n`;
  }

  str += `  control_plane_id = konnect_gateway_control_plane.tfdemo.id\n}\n`;
  console.log(str);
}

function lead(indent) {
  return "  ".repeat(indent);
}

function outputNestedObject(obj, indent = 1) {
  let str = ``;
  for (let k in obj) {
    str += `${lead(indent)}${k} = `;
    if (typeof obj[k] === "object") {
      if (Array.isArray(obj[k])) {
        str += `${lead(indent)}  ${k} = ${JSON.stringify(obj[k])}\n`;
      } else {
        str += "{\n";
        str += outputNestedObject(obj[k], indent + 1);
        str += `${lead(indent)}}\n`;
      }
    } else {
      str += `${lead(indent)}"${obj[k]}"\n`;
    }
  }
  return str;
}

function addPlugin(p, parent, parentRef) {
  outputResource(
    `konnect_plugin_${name(p.name)}`,
    p,
    { [parent]: parentRef },
    `${name(p.name)}_${p.config.model.provider}_${p.config.model.name}_${
      p.config.route_type
    }`.replace(/[\./-]/g, "_")
  );
}

function addRoute(r, serviceName) {
  outputResource("konnect_route", r, { service: serviceName });
  return {
    plugins: r.plugins,
  };
}

function addService(s) {
  outputResource("konnect_service", s);
  return {
    serviceName: name(s.name),
    plugins: s.plugins,
    routes: s.routes,
  };
}
