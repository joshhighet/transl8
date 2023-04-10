## transl8

_a translator for internet search engine data definitions_

official query syntax links;

- [zoomeye.org](https://www.zoomeye.org/doc?Thechannel=user)
- [binaryedge.io](https://docs.binaryedge.io/search/)
- [shodan.io](https://beta.shodan.io/search/filters)
- [censys.io](https://search.censys.io/search/definitions?resource=hosts)
- [fofa.info](https://en.fofa.info/api)

---

|query     |shodan           |censys                                  |binaryedge                |zoomeye     |fofa     |meta_desc     |
|----------|-----------------|----------------------------------------|--------------------------|------------|---------|--------------|
|jarm      |ssl.jarm         |jarm                                    |jarm_hash                 |jarm        |         |jarm signature|
|favicon   |http.favicon.hash|services.http.response.favicons.md5_hash|web.favicon.mmh3          |iconhash    |icon_hash|mmh3          |
|country   |country          |location.country_code                   |country                   |country     |         |two letter iso|
|city      |city             |location.city                           |geoip.city_name           |city        |         |              |
|httpstring|http.html        |services.http.response.body             |body.content              |{freeform}  |         |              |
|httptitle |http.title       |services.http.response.html_title       |web.title                 |title       |         |              |
|httphash  |http.html_hash   |services.http.response.body_hash        |body.sha256               |            |         |              |
|asn       |asn              |autonomous_system.asn                   |asn                       |asn         |         |              |
|port      |port             |services.port                           |port                      |port        |         |              |
|ip        |ip               |ip                                      |ip                        |ip          |ip       |              |
|header    |                 |                                        |web.headers.all           |            |         |              |
|cidr      |net              |ip                                      |ip                        |cidr        |         |              |
|hostname  |hostname         |dns.names                               |rdns                      |hostname    |         |              |
|ja3       |ssl.ja3s         |services.tls.ja3s                       |ssl.server_info.ja3_digest|            |         |              |
|org       |org              |autonomous_system.organization          |as_name                   |organization|         |              |

---
