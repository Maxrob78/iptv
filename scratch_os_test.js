const OS = require('opensubtitles-api');
const OpenSubtitles = new OS({
    useragent: 'TemporaryUserAgent',
    ssl: true
});

async function test() {
    try {
        console.log("Searching for Inception...");
        const searchResult = await OpenSubtitles.search({
            sublanguageid: 'fre',
            query: 'Inception'
        });
        console.log(Object.keys(searchResult));
        if (searchResult.fr) {
            console.log("Found FR sub:", searchResult.fr.url);
        } else {
            console.log("No FR sub found.");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}
test();
