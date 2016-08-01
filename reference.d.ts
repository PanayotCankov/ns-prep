declare module "fs" {
    function readdirSync(path: string): string[];
    function existsSync(path: string): boolean;
    function readFileSync(path: string): string;
}
declare module "path" {
    const separator: string;
    function join(...paths:string[]): string;
}
declare module "chalk" {
    function bold(text: string): string;

    function red(text: string): string;
    function yellow(text: string): string;
    function green(text: string): string;
    function gray(text: string): string;
}
declare module "semver" {
    function lt(first: string, second: string);
    function gt(first: string, second: string);
    function satisfies(version: string, querry: string);
}