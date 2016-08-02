declare module "fs" {
    function readdirSync(path: string): string[];
    function existsSync(path: string): boolean;
    function readFileSync(path: string): string;
    function writeFileSync(path: string, content: any);
    function readdirSync(path: string): string[];
    function lstatSync(path: string): {
        isDirectory(): boolean;
        isFile(): boolean;
        mtime: Date;
        ctime: Date;
    }
    function mkdirSync(path: string);
    function unlinkSync(path: string);
    function rmdirSync(path: string);
}
declare module "path" {
    const sep: string;
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
declare module "shelljs" {
    function cp(source: string, dest: string);
    function cp(options: string, source: string, dest: string);
    function cp(source: string[], dest: string);
    function cp(options: string, source: string[], dest: string);
}