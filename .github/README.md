## transl8

transl8 is a syntax translator and query generator for network search engines. it can help compile cross-platform queries for various global network scan data providers.

the web service is available at [transl8.watchdawg.io](https://transl8.watchdawg.io)

there are two CSV's which define the data presented on the above site;

- [ `queries.csv` ](https://github.com/joshhighet/transl8/blob/main/queries.csv) - _the query lookup table_
- [ `providers.csv` ](https://github.com/joshhighet/transl8/blob/main/providers.csv) - _the search provider configuration table_

whern proposing query changes, PR one of the above - a GitHub action will automatically update the lookups leveraged by the web service.

| Platform                             | Login Location                             | Query Documentation                               |
|--------------------------------------|--------------------------------------------|---------------------------------------------------|
| [<img src="https://raw.githubusercontent.com/joshhighet/transl8/main/docs/assets/zoomeye.jpg" alt="ZoomEye" width="20" height="20"> ZoomEye](https://www.zoomeye.ai)          | [zoomeye.ai/login](https://www.zoomeye.ai/cas/en-US/ui/loginin)                        | [zoomeye.ai/doc](https://www.zoomeye.ai) |
| [<img src="https://raw.githubusercontent.com/joshhighet/transl8/main/docs/assets/censys.png" alt="Censys" width="20" height="20"> Censys](https://censys.io)            | [censys.io/login](https://censys.io/login)                                | [search.censys.io/search/definitions](https://search.censys.io/search/definitions?resource=hosts) |
| [FOFA Search](https://en.fofa.info)   | [en.fofa.info/f_login](https://en.fofa.info/f_login)                      | [en.fofa.info/api](https://en.fofa.info/api) |
| [<img src="https://raw.githubusercontent.com/joshhighet/transl8/main/docs/assets/unknown.png" alt="Quake 360" width="20" height="20"> Quake 360](https://quake.360.net)       | [quake.360.net/quake/login#/](https://quake.360.net/quake/login#/)        | [quake.360.net/quake/#/help](https://quake.360.net/quake/#/help?id=5eb238f110d2e850d5c6aec8&title=检索关键词) |
| [<img src="https://raw.githubusercontent.com/joshhighet/transl8/main/docs/assets/netlas.png" alt="Netlas" width="20" height="20"> Netlas](https://app.netlas.io)            | [app.netlas.io/login/](https://app.netlas.io/login/)                      | [app.netlas.io/responses/](https://app.netlas.io/responses/) |
| [<img src="https://raw.githubusercontent.com/joshhighet/transl8/main/docs/assets/onyphe.jpg" alt="Onyphe" width="20" height="20"> Onyphe](https://www.onyphe.io)            | [onyphe.io/signin](https://www.onyphe.io/signin)                          | [onyphe.io/docs](https://www.onyphe.io/docs/onyphe-query-language) | 
| [<img src="https://raw.githubusercontent.com/joshhighet/transl8/main/docs/assets/criminalip.png" alt="Criminal IP" width="20" height="20"> Criminal IP](https://www.criminalip.io)   | [criminalip.io/en/login](https://www.criminalip.io/en/mypage/information) | [criminalip.io/en/developer](https://www.criminalip.io/en/developer/filters-and-tags/filters) |
| [<img src="https://raw.githubusercontent.com/joshhighet/transl8/main/docs/assets/hunter.png" alt="Hunter" width="20" height="20"> Hunter](https://hunter.how)            | [hunter.how/profile](https://hunter.how/profile)                          | [hunter.how/guide](https://hunter.how/guide) |
| [<img src="https://raw.githubusercontent.com/joshhighet/transl8/main/docs/assets/shodan.png" alt="Shodan" width="20" height="20"> Shodan](https://account.shodan.io)            | [account.shodan.io/login](https://account.shodan.io/login)                | [beta.shodan.io/search/filters](https://beta.shodan.io/search/filters) |
| [<img src="https://raw.githubusercontent.com/joshhighet/transl8/main/docs/assets/urlscan.png" alt="urlscan.io" width="20" height="20"> urlscan.io](https://urlscan.io)       | [urlscan.io/user/login/](https://urlscan.io/user/login)                   | [urlscan.io/docs/search/](https://urlscan.io/docs/search) |
