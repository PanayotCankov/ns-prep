#! /usr/bin/env node

import Project from "./index";
declare var process;

let project = new Project();

console.time("build source map");
project.buildSourceMap();
console.timeEnd("build source map");
project.printSourceMap();
console.log("Flattened packages:");
console.log(project.getPackages());
