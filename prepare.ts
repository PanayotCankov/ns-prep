#! /usr/bin/env node

import Project from "./index";

let project = new Project(process.cwd());

console.time("build source map");
project.buildSourceMap();
console.timeEnd("build source map");
project.printSourceMap();
console.log("Flattened packages:");
console.log(project.prodPackages());
