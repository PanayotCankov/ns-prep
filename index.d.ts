export default class Project {
    constructor();

    buildSourceMap(): void;
    printSourceMap(): void;
    getPackages(): {
        name: string;
        path: string;
        nativescript?: {
            ios?: string;
            android?: string;
        };
    }[];
}
