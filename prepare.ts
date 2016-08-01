#! /usr/bin/env node

import { existsSync, readFileSync } from "fs";
import { join, separator } from "path";
import { red, yellow, green, gray, bold } from "chalk";
import * as semver from "semver";

console.time("run");

interface PackageJson {
    name?: string;
    version?: string;
    dependencies?: { [key: string]: string };
    devDependencies?: { [key: string]: string };
}

const enum Availability {
    Available,
    NotInstalled,
    ShadowedByAncestor,
    ShadowedByDiverged
}

interface Package {
    name: string;
    path: string;
    packageJson: PackageJson;
    version: string;
    requiredVersion: string;
    resolvedAtParent: { [key: string]: any; };
    resolvedAtGrandparent: { [key: string]: any; };
    children: Package[];
    availability: Availability;
}

interface FlattenMap {
    [dependency: string]: Package;
}

function resolve(pack: Package, flattenMap: FlattenMap) {
    let packageJsonPath = join(pack.path, "package.json");

    if (!existsSync(packageJsonPath)) {
        pack.availability = Availability.NotInstalled;
        return;
    }

    if (pack.name in pack.resolvedAtGrandparent) {
        pack.availability = Availability.ShadowedByAncestor;
        return;
    }

    pack.packageJson = JSON.parse(readFileSync(packageJsonPath));
    pack.version = pack.packageJson.version;

    if (pack.name in flattenMap) {
        // Resolve conflicts
        let other = flattenMap[pack.name];
        // Get the one with higher version...
        let packVersion = pack.packageJson.version;
        let otherVersion = other.packageJson.version;
        if (semver.gt(packVersion, otherVersion)) {
            pack.availability = Availability.ShadowedByDiverged;
            flattenMap[pack.name] = pack;
        } else {
            other.availability = Availability.ShadowedByDiverged;
        }
    } else {
        flattenMap[pack.name] = pack;
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
            name: dependency,
            path: dependencyPath,
            packageJson: null,
            version: null,
            requiredVersion,
            resolvedAtGrandparent: pack.resolvedAtParent,
            resolvedAtParent: resolved,
            children: [],
            availability: Availability.Available
        }
        pack.children.push(child);
        resolve(child, flattenMap);
    }
}

var root: Package = {
    name: ".",
    path: "./",
    packageJson: null,
    requiredVersion: "*",
    version: null,
    resolvedAtParent: {},
    resolvedAtGrandparent: {},
    children: [],
    availability: Availability.Available
}
var flattenMap: FlattenMap = {};
resolve(root, flattenMap);

function unpack(pack: Package, flattenMap: FlattenMap) {
    // Check content for package.json nested files.
}
unpack(root, flattenMap);

var availabilityString = {
    [Availability.Available]: "",
    [Availability.NotInstalled]: "(not installed)",
    [Availability.ShadowedByAncestor]: "(shadowed by ancestor)",
    [Availability.ShadowedByDiverged]: "(shadowed by diverged)"
}
var availabilitySign = {
    [Availability.Available]: "✔",
    [Availability.NotInstalled]: "✘",
    [Availability.ShadowedByAncestor]: "✘",
    [Availability.ShadowedByDiverged]: "✘"
}
var availabilityColor = {
    [Availability.Available]: bold,
    [Availability.NotInstalled]: gray,
    [Availability.ShadowedByAncestor]: red,
    [Availability.ShadowedByDiverged]: red
}
function print(pack: Package, ident: string = "") {
    console.log(ident + " - " + availabilityColor[pack.availability](availabilitySign[pack.availability] + " " + pack.name + (pack.version ? "@" + pack.version : "") + " " + availabilityString[pack.availability]));
    pack.children.forEach(function (child) {
        print(child, ident + "  ");
    })
}
print(root);

// TODO: Find about "parse5" conflict and get the higher version of it.

console.timeEnd("run");
