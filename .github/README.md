## transl8

_transl8 is a work-in-progress under active development_

transl8 helps build simple cross-platform queries for various internet search engines

this repository is used to generate the frontend, [transl8.watchdawg.io](https://transl8.watchdawg.io)

two CSV's define the data presented on the above site. when submitting additional queries, fixes or search engines, PR one of the following and the frontend will reflect accordingly

- [ `queries.csv` ](https://github.com/joshhighet/transl8/blob/main/queries.csv) - the unified query lookup table
- [ `providers.csv` ](https://github.com/joshhighet/transl8/blob/main/providers.csv) - information on search-providers used such as URL constructors and platform specific operators

| Platform        | Login Location | Query Documentation |
|-----------------|----------------|---------------------|
| ZoomEye         | [zoomeye.org/login](https://www.zoomeye.org/login) | [zoomeye.org/doc](https://www.zoomeye.org/doc?Thechannel=user) |
| Censys          | [censys.io/login](https://censys.io/login) | [search.censys.io/search/definitions](https://search.censys.io/search/definitions?resource=hosts) |
| FOFA Search     | [en.fofa.info/f_login](https://en.fofa.info/f_login) | [en.fofa.info/api](https://en.fofa.info/api) |
| Quake 360       | [quake.360.net/quake/login#/](https://quake.360.net/quake/login#/) | [quake.360.net/quake/#/help](https://quake.360.net/quake/#/help?id=5eb238f110d2e850d5c6aec8&title=检索关键词) |
| Netlas          | [app.netlas.io/login/](https://app.netlas.io/login/) | [app.netlas.io/responses/](https://app.netlas.io/responses/) |
| Onyphe          | [onyphe.io/signin](https://www.onyphe.io/signin) | [onyphe.io/docs](https://www.onyphe.io/docs/onyphe-query-language) | 
| Criminal IP     | [criminalip.io/en/login](https://www.criminalip.io/en/mypage/information) | [criminalip.io/en/developer](https://www.criminalip.io/en/developer/filters-and-tags/filters) |
| Hunter          | [hunter.how/profile](https://hunter.how/profile) | [hunter.how/guide](https://hunter.how/guide) |
| Shodan          | [account.shodan.io/login](https://account.shodan.io/login) | [beta.shodan.io/search/filters](https://beta.shodan.io/search/filters) |
| BinaryEdge      | [app.binaryedge.io/login](https://app.binaryedge.io/login) | [docs.binaryedge.io/search](https://docs.binaryedge.io/search/) |
