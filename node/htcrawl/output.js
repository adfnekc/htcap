module.exports = class output {
    constructor(outfunc) {
        this.outfunc = outfunc;
        this.outmsgs = {
            url:"",
            status: "",
            errors: "",
            redirect: "",
            cookies: [],
            requests: []
        };
        this.printedRequests = [];
    }

    print_log = (type, msg) => {
        switch (type) {
            case "request": this.outmsgs["requests"].push(msg);
                break;
            case "cookie": this.outmsgs["cookies"].push(...msg);
                break;
        }
    }

    print_url = (targetUrl)=>{
        this.outmsgs["url"] = targetUrl
    }

    printCookies = async (crawler) => {
        this.print_log("cookie", await crawler.cookies());
    }

    printStatus = async (crawler) => {
        let status = "ok"
        if (crawler.redirect()) {
            this.outmsgs["redirect"] = crawler.redirect();
        }
        if (crawler.errors().length > 0 && !crawler.redirect()) {
            this.outmsgs["errors"] = crawler.errors();
            status = "error";
        }
        this.outmsgs["status"] = status
        await this.printCookies(crawler);
        this.outfunc(this.outmsgs);
    }

    printRequest = (req) => {
        if (!("method" in req))
            req.method = "GET";
        if (!("data" in req))
            req.data = null;
        req.url = this.filterUrl(req.url);

        if (req.url == "javascript:void(0);") {
            return;
        }

        if (req.url == "http://localhost:8080/action/login") {
            debugger;
        }

        let jr = JSON.stringify(req);
        if (this.printedRequests.indexOf(jr) != -1)
            return;
        this.printedRequests.push(jr);
        this.print_log("request", jr);
    }

    printLinks = async (rootNode, page) => {
        if (!rootNode) return;
        let el = await page.$(rootNode);
        let req, t;
        if (!el) return;
        var links = await el.$$("a");
        for (let l of links) {
            t = await (await l.getProperty('href')).jsonValue();
            req = { type: "link", url: t };
            this.printRequest(req);
        }
        var metas = await el.$$('meta[http-equiv="refresh"]');
        for (let m of metas) {
            t = await (await m.getProperty('content')).jsonValue();
            t = t.split(";");
            if (t.length > 1 && t[1] && t[1].toLowerCase().startsWith("url=")) {
                var purl = new URL(page.url());
                let absurl = new URL(t[1].substr(4), purl.protocol + "//" + purl.hostname);
                req = { type: "link", url: absurl.href };
                this.printRequest(req);
            }
        }
    }

    printForms = async (rootNode, page) => {
        if (!rootNode) return;
        let el = await page.$(rootNode);//.then(el => {
        //page.evaluate(e => console.log(e.innerText), el)
        if (!el) return;
        let forms = await el.$$("form");//.then(forms => {
        for (let f of forms) {
            let req = await this.getFormAsRequest(f, page); //.then(req => {
            this.printRequest(req);
        }
    }

    getFormAsRequest = async (frm, page) => {
        var formObj = { type: "form" };
        var inputs = null;

        formObj.method = await (await frm.getProperty("method")).jsonValue();
        if (formObj.method.toUpperCase() == "POST" && formObj.type == "form") {
            // debugger;
        }

        if (!formObj.method) {
            formObj.method = "GET";
        } else {
            formObj.method = formObj.method.toUpperCase();
        }

        formObj.url = await (await frm.getProperty("action")).jsonValue();
        if (typeof formObj.url != "string" || !formObj.url) {
            formObj.url = page.url();
        }
        formObj.data = [];
        inputs = await frm.$$("input, select, textarea");
        for (let input of inputs) {
            let name = await (await input.getProperty("name")).jsonValue();
            if (!name) continue;
            let value = await (await input.getProperty("value")).jsonValue();
            let tagName = await (await input.getProperty("tagName")).jsonValue();
            let type = await (await input.getProperty("type")).jsonValue();

            let par = encodeURIComponent(name) + "=" + encodeURIComponent(value);
            if (tagName == "INPUT" && type != null) {

                switch (type.toLowerCase()) {
                    case "button":
                    case "submit":
                        break;
                    case "checkbox":
                    case "radio":
                        let checked = await (await input.getProperty("checked")).jsonValue();
                        if (checked)
                            formObj.data.push(par);
                        break;
                    case "file":
                        formObj.type = "file";
                        formObj.data.push(par + "@file");
                        break;
                    default:
                        formObj.data.push(par);
                }

            } else {
                formObj.data.push(par);
            }
        }

        formObj.data = formObj.data.join("&");
        return formObj;
    };

    filterUrl = (url) => {
        url = url.split("#")[0];
        return url;
    }
}
