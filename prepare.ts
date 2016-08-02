#! /usr/bin/env node

import { existsSync, writeFileSync, readFileSync, readdirSync, lstatSync, mkdirSync, unlinkSync, rmdirSync } from "fs";
import { join, sep } from "path";
import { red, yellow, green, gray, bold } from "chalk";
import * as shelljs from "shelljs";
import * as semver from "semver";

declare var require, process;
var child_process = require("child_process")
var fs = require("fs");

console.time("total");

// let platform = process.argv[2];
// console.log("Platform: " + platform);

// let platformSuffix = "." + platform + ".";
// let platformFilters: string[] = platform === "ios" ? [".android."] : [".ios."];

// let target = process.argv[3];
// console.log("target: " + target);

// let targetAppPath = join(target, "app");
// console.log("app: " + targetAppPath);

// let zipPath = join(target, "livezync.zip");

// let tnsModulesPath = join(targetAppPath, "tns_modules");
// console.log("tns_modules: " + tnsModulesPath);
// console.log("");

// // TODO: Let's try to get delta and update gracefully the output...
// console.time("clean");
// child_process.spawnSync("rm", ["-rf", tnsModulesPath]);
// child_process.spawnSync("rm", ["-rf", zipPath]);
// console.timeEnd("clean");

class Project {
    private static tns_modules = "tns_modules";

    private app: Project.Package;
    private packages: Project.FlattenMap;

    constructor() {
    }

    public buildSourceMap() {
        this.app = {
            type: Project.PackageType.App,
            name: ".",
            path: ".",
            packageJson: null,
            requiredVersion: "*",
            version: null,
            resolvedAtParent: {},
            resolvedAtGrandparent: {},
            children: [],
            files: [],
            directories: [],
            availability: Project.Availability.Available
        }
        this.packages = {};

        this.selectDependencyPackages(this.app);
        this.listPackageFiles(this.app);
        this.listAppFiles();
    }

    public printSourceMap() {
        if (!this.app) {
            throw "Requires source map to be build first";
        }
        this.printRecursive(this.app, "");
    }

    public buildDelta(output: Project.Destination): Project.Delta.Build {

        let platformSuffix = "." + output.platform + ".";
        let platformSuffixFilter = output.filterPlatforms.map(f => "." + f + ".");

        let delta: Project.Delta.Build = {
            copy: {},
            mkdir: {}
        }

        let appLength = ("app" + sep).length;
        this.app.directories.filter(d => d != "app" + sep).forEach(dir => delta.mkdir[dir.substr(appLength)] = true);
        this.app.files.forEach(file => delta.copy[file.substr(appLength)] = file);

        function copyAll(pack: Project.Package) {
            pack.files.forEach(file => {
                if (platformSuffixFilter.some(f => file.indexOf(f) >= 0)) {
                    return;
                }
                let from = pack.path + sep + file;
                let to = Project.tns_modules + sep + pack.name + sep + file.replace(platformSuffix, ".");
                // TODO: If `to in delta.copy`, log collision.
                delta.copy[to] = from;
            });
        }

        function mkdirAll(pack: Project.Package) {
            if (pack.type === Project.PackageType.App) {
                return;
            }

            let path = Project.tns_modules + sep;
            pack.name.split(sep).forEach(dir => {
                path = path + dir + sep;
                delta.mkdir[path] = true;
            });

            pack.directories.forEach(dir => {
                let path = Project.tns_modules + sep + pack.name + sep + dir + sep;
                delta.mkdir[path] = true;
            });
        }

        delta.mkdir[Project.tns_modules + sep] = true;
        for (let key in this.packages) {
            let pack = this.packages[key];
            copyAll(pack);
            mkdirAll(pack);
        }

        return delta;
    }

    public rebuildDelta(output: Project.Destination): Project.Delta.Rebuild {
        let buildDelta = this.buildDelta(output);

        let delta: Project.Delta.Rebuild = {
            copy: buildDelta.copy,
            mkdir: buildDelta.mkdir,
            rmdir: {},
            rmfile: {}
        };

        // TODO: Recurse files at output and calculate differences...
        let diff = (path?: string) => {
            let outPath = path ? output.path + sep + path : output.path;
            readdirSync(outPath).forEach(f => {
                let filePath = path ? path + sep + f : f;
                let dirPath = filePath + sep;
                let destinationStats = lstatSync(output.path + sep + filePath);
                if (destinationStats.isDirectory()) {
                    if (dirPath in delta.mkdir) {
                        delete delta.mkdir[dirPath];
                    } else {
                        delta.rmdir[dirPath] = true;
                    }
                    diff(filePath);
                } else {
                    // ignore: .DS_Store
                    if (filePath in delta.copy) {
                        let source = delta.copy[filePath];
                        let sourceStats = lstatSync(source);
                        let newer = destinationStats.mtime.getTime() < sourceStats.mtime.getTime();
                        if (!newer) {
                            delete delta.copy[filePath];
                        }
                    } else {
                        delta.rmfile[filePath] = true;
                    }
                }
            })
        }
        diff();

        return delta;
    }

    public applyDelta(output: Project.Destination, delta: Project.Delta.Rebuild) {
        console.time("  mkdir");
        Object.keys(delta.mkdir).sort().forEach(dir => mkdirSync(output.path + sep + dir));
        console.timeEnd("  mkdir");

        console.time("  copy");
        for (let to in delta.copy) {
            let toFull = output.path + sep + to;
            let from = delta.copy[to];
            writeFileSync(toFull, readFileSync(from));
        }
        console.timeEnd("  copy");

        console.time("  rm file");
        Object.keys(delta.rmfile).forEach(file => unlinkSync(output.path + sep + file));
        console.timeEnd("  rm file");

        console.time("  rm dir");
        Object.keys(delta.rmdir).sort().reverse().forEach(dir => rmdirSync(output.path + sep + dir));
        console.timeEnd("  rm dir");
    }

    private selectDependencyPackages(pack: Project.Package) {

        let packageJsonPath = join(pack.path, "package.json");

        if (!existsSync(packageJsonPath)) {
            pack.availability = Project.Availability.NotInstalled;
            return;
        }

        if (pack.name in pack.resolvedAtGrandparent) {
            pack.availability = Project.Availability.ShadowedByAncestor;
            return;
        }

        pack.packageJson = JSON.parse(readFileSync(packageJsonPath));
        pack.version = pack.packageJson.version;

        if (pack.type === Project.PackageType.App) {
        } else if (pack.name in this.packages) {
            // Resolve conflicts
            let other = this.packages[pack.name];
            // Get the one with higher version...
            let packVersion = pack.packageJson.version;
            let otherVersion = other.packageJson.version;
            if (semver.gt(packVersion, otherVersion)) {
                other.availability = Project.Availability.ShadowedByDiverged;
                this.packages[pack.name] = pack;
            } else {
                pack.availability = Project.Availability.ShadowedByDiverged;
            }
        } else {
            pack.availability = Project.Availability.Available;
            this.packages[pack.name] = pack;
        }

        let resolved: { [key: string]: any; } = {};
        for (let key in pack.resolvedAtParent) {
            resolved[key] = pack.resolvedAtParent[key];
        }
        for (var dependency in pack.packageJson.dependencies) {
            resolved[dependency] = true;
        }

        for (var dependency in pack.packageJson.dependencies) {
            let requiredVersion = pack.packageJson.dependencies[dependency];
            let dependencyPath = join(pack.path, "node_modules", dependency);
            let child = {
                type: Project.PackageType.Package,
                name: dependency,
                path: dependencyPath,
                packageJson: null,
                version: null,
                requiredVersion,
                resolvedAtGrandparent: pack.resolvedAtParent,
                resolvedAtParent: resolved,
                children: [],
                files: [],
                directories: [],
                availability: Project.Availability.NotInstalled
            }
            pack.children.push(child);
            this.selectDependencyPackages(child);
        }
    }

    private listAppFiles() {
        let appPath = "app";
        let ignoreFiles = {
            ["app" + sep + "App_Resources"]: true
        };

        if (existsSync(appPath)) {
            this.app.directories.push("app/");
            let listAppFiles = (path: string) => {
                readdirSync(path).forEach(f => {
                    let filePath = path + sep + f;
                    if (filePath in ignoreFiles) {
                        return;
                    }
                    let dirPath = filePath + sep;
                    let lstat = lstatSync(filePath);
                    if (lstat.isDirectory()) {
                        this.app.directories.push(dirPath);
                        listAppFiles(filePath);
                    } else if (lstat.isFile()) {
                        this.app.files.push(filePath);
                    }
                });
            }
            listAppFiles(appPath);
        }
    }

    private listPackageFiles(pack: Project.Package) {
        if (pack.type === Project.PackageType.Package && pack.availability === Project.Availability.Available) {
            this.listNestedPackageFiles(pack, pack.path, pack);
        }
        pack.children.forEach(child => this.listPackageFiles(child));
    }

    private listNestedPackageFiles(pack: Project.Package, dirPath: string, fileScope: Project.Package) {
        // TODO: Once per pack:
        let modulePackageJson = pack.path + sep + "package.json";
        let ignorePaths: { [key:string]: boolean } = {
            [pack.path + sep + "node_modules"]: true,
            [pack.path + sep + "platforms"]: true
        };
        let scopePathLength = fileScope.path.length + sep.length;
        readdirSync(dirPath).forEach(childPath => {
            let path = dirPath + sep + childPath;
            if (path in ignorePaths) {
                return;
            }
            let stat = lstatSync(path);
            if (stat.isDirectory()) {
                let packageJsonPath = path + sep + "package.json";
                if (modulePackageJson != packageJsonPath && existsSync(packageJsonPath)) {
                    let packageJson = JSON.parse(readFileSync(packageJsonPath));

                    let nestedPackage: Project.Package = {
                        type: Project.PackageType.NestedPackage,
                        name: path.substr(pack.path.length + sep.length),
                        path,
                        packageJson,
                        version: null,
                        requiredVersion: null,
                        resolvedAtParent: null,
                        resolvedAtGrandparent: null,
                        children: [],
                        files: [],
                        directories: [],
                        availability: Project.Availability.Available
                    };

                    pack.children.push(nestedPackage);

                    if (nestedPackage.name in this.packages) {
                        let other = this.packages[pack.name];
                        pack.availability = Project.Availability.ShadowedByDiverged;
                    } else {
                        this.packages[nestedPackage.name] = nestedPackage;
                    }
                    this.listNestedPackageFiles(pack, path, nestedPackage);
                } else {
                    let relativePath = path.substr(scopePathLength);
                    fileScope.directories.push(relativePath);
                    this.listNestedPackageFiles(pack, path, fileScope);
                }
            } else if (stat.isFile()) {
                let relativePath = path.substr(scopePathLength);
                fileScope.files.push(relativePath);
            }
        });
    }

    static availabilityString = {
        [Project.Availability.Available]: "",
        [Project.Availability.NotInstalled]: "(not installed)",
        [Project.Availability.ShadowedByAncestor]: "(shadowed by ancestor)",
        [Project.Availability.ShadowedByDiverged]: "(shadowed by diverged)"
    }
    static availabilitySign = {
        [Project.Availability.Available]: "✔",
        [Project.Availability.NotInstalled]: "✘",
        [Project.Availability.ShadowedByAncestor]: "✘",
        [Project.Availability.ShadowedByDiverged]: "✘"
    }
    static availabilityColor = {
        [Project.Availability.Available]: bold,
        [Project.Availability.NotInstalled]: gray,
        [Project.Availability.ShadowedByAncestor]: red,
        [Project.Availability.ShadowedByDiverged]: red
    }

    private printRecursive(pack: Project.Package, ident) {
        console.log(ident + " - " + Project.availabilityColor[pack.availability](Project.availabilitySign[pack.availability] + " " + pack.name + (pack.version ? "@" + pack.version : "") + " " + Project.availabilityString[pack.availability] + (pack.files.length > 0 ? "(" + pack.files.length + ")" : "")));
        pack.children.forEach(child => this.printRecursive(child, ident + "  "));
    }

    private static packageJsonSuffix = sep + "package.json";
    private static packageJsonSuffixLenght = Project.packageJsonSuffix.length;

    private static isPackageJson(path: string): boolean {
        return path.substr(-Project.packageJsonSuffixLenght) === Project.packageJsonSuffix;
    }
}

namespace Project {
    export interface PackageJson {
        name?: string;
        version?: string;
        dependencies?: { [key: string]: string };
        devDependencies?: { [key: string]: string };
    }

    export const enum Availability {
        Available,
        NotInstalled,
        ShadowedByAncestor,
        ShadowedByDiverged
    }

    export const enum PackageType {
        App,
        Package,
        NestedPackage
    }

    export interface Package {
        type: PackageType;
        name: string;
        path: string;
        packageJson: PackageJson;
        version: string;
        requiredVersion: string;
        resolvedAtParent: { [key: string]: any; };
        resolvedAtGrandparent: { [key: string]: any; };
        children: Package[];
        files: string[];
        directories: string[];
        availability: Availability;
    }

    export interface FlattenMap {
        [dependency: string]: Package;
    }

    export interface Destination {
        path: string,
        platform: string,
        filterPlatforms: string[]
    }

    export namespace Delta {
        export interface Build {
            copy: { [to: string]: /* from: */ string },
            mkdir: { [dir: string]: boolean } /* Set<string> */
        }

        export interface Rebuild extends Build {
            rmfile: { [dir: string]: boolean } /* Set<string> */,
            rmdir: { [dir: string]: boolean } /* Set<string> */,
        }
    }
}

let project = new Project();

console.time("total");

console.time("build source map");
project.buildSourceMap();
console.timeEnd("build source map");

// project.printSourceMap();

console.time("rebuild delta ios");
let output = {
    path: "platforms" + sep + "ios" + sep + "SampleAppNG2" + sep + "app",
    platform: "ios",
    filterPlatforms: ["android"],
};
let delta = project.rebuildDelta(output);
console.timeEnd("rebuild delta ios");

// console.log("todo:");
// console.log("  mkdirs " + Object.keys(delta.mkdir).length + " dirs.");
// console.log("  copy " + Object.keys(delta.copy).length + " files.");
// console.log("  rmfiles " + Object.keys(delta.rmfile).length + " files.");
// console.log("  rmdir " + Object.keys(delta.rmdir).length + " dirs.");

console.time("apply delta");
project.applyDelta(output, delta);
console.timeEnd("apply delta");

console.time("zip");
child_process.spawnSync("zip", ["-r", "-X", "lifesync.zip", "app"], { cwd: "platforms" + sep + "ios" + sep + "SampleAppNG2" });
console.timeEnd("zip");

console.timeEnd("total");
