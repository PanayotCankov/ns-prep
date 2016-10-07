import { existsSync, writeFileSync, readFileSync, readdirSync, lstatSync, mkdirSync, unlinkSync, rmdirSync } from "fs";
import { join, sep, dirname } from "path";
import { red, yellow, green, gray, bold } from "chalk";
import * as shelljs from "shelljs";
import * as semver from "semver";

declare var require, process;
var fs = require("fs");

class Project {
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
    }

    public printSourceMap() {
        if (!this.app) {
            throw "Requires source map to be build first";
        }
        this.printRecursive(this.app, "");
    }

    public getPackages(): { name: string, path: string, nativescript?: { ios?: string, android?: string }}[] {
        let flatten = [];
        for(let name in this.packages) {
            let pack = this.packages[name];
            let dep: any = { name: pack.name, path: pack.path };
            if (pack.packageJson.nativescript) {
                dep.nativescript = pack.packageJson.nativescript;
            }
            flatten.push(dep);
        }
        return flatten;
    }

    private static tns_modules = "tns_modules";
    private app: Project.Package;
    private packages: Project.FlattenMap;

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
                pack.availability = Project.Availability.Available;
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

    private listPackageFiles(pack: Project.Package) {
        if (pack.type === Project.PackageType.Package
            && pack.availability === Project.Availability.Available
            && pack.packageJson.nativescript) {

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
                        let other = this.packages[nestedPackage.name];
                        if (other.type === Project.PackageType.NestedPackage) {
                            nestedPackage.availability = Project.Availability.ShadowedByNestedPackage;
                        } else {
                            if (other.availability === Project.Availability.ShadowedByNestedPackage) {
                                this.packages[nestedPackage.name] = nestedPackage;
                                nestedPackage.availability = Project.Availability.ShadowedByNestedPackage;
                            } else {
                                other.availability = Project.Availability.ShadowedByNestedPackage;
                            }
                        }
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

    private static availabilityString = {
        [Project.Availability.Available]: "",
        [Project.Availability.NotInstalled]: "(not installed)",
        [Project.Availability.ShadowedByAncestor]: "(shadowed by ancestor)",
        [Project.Availability.ShadowedByDiverged]: "(shadowed by diverged)",
        [Project.Availability.ShadowedByNestedPackage]: "(shadowed by nested package)"
    }
    private static availabilitySign = {
        [Project.Availability.Available]: "✔",
        [Project.Availability.NotInstalled]: "✘",
        [Project.Availability.ShadowedByAncestor]: "✘",
        [Project.Availability.ShadowedByDiverged]: "✘",
        [Project.Availability.ShadowedByNestedPackage]: "✘"
    }
    private static availabilityColor = {
        [Project.Availability.Available]: bold,
        [Project.Availability.NotInstalled]: gray,
        [Project.Availability.ShadowedByAncestor]: red,
        [Project.Availability.ShadowedByDiverged]: red,
        [Project.Availability.ShadowedByNestedPackage]: red,
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
        nativescript?: {
            android?: string,
            ios?: string
        };
    }

    export const enum Availability {
        Available,
        NotInstalled,
        ShadowedByAncestor,
        ShadowedByDiverged,
        ShadowedByNestedPackage
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

export default Project;
