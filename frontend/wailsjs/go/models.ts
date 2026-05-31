export namespace main {
	
	export class ScanRequest {
	    cidrs: string[];
	    concurrency: number;
	    mode: string;
	    sni: string;
	
	    static createFrom(source: any = {}) {
	        return new ScanRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cidrs = source["cidrs"];
	        this.concurrency = source["concurrency"];
	        this.mode = source["mode"];
	        this.sni = source["sni"];
	    }
	}

}

