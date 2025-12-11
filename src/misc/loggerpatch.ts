const _rawlog = console.log.bind(console);
const ensureLength2 = (e: any) => {const t = e.toString(); return t.length === 1 ? ("0" + t) : t;}
global.console.log = (...e) => {
    const now = new Date();
    const builtDateString = (
        "[" +
        [
            now.getDate(),
            now.getMonth() + 1,
            now.getFullYear()
        ].map(e => ensureLength2(e)).join("/") +
        " " +
        [
            now.getHours(),
            now.getMinutes(),
            now.getSeconds()
        ].map(e => ensureLength2(e)).join(":") +
        "]"
    )
    return _rawlog(builtDateString, ...e);
}