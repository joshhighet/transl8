## transl8

_this project is a work-in-progress under active development_

[![deploy static content](https://github.com/joshhighet/transl8/actions/workflows/static.yml/badge.svg)](https://github.com/joshhighet/transl8/actions/workflows/static.yml) [![csv to json](https://github.com/joshhighet/transl8/actions/workflows/csv2json.yml/badge.svg)](https://github.com/joshhighet/transl8/actions/workflows/csv2json.yml) [![yml to json](https://github.com/joshhighet/transl8/actions/workflows/yml2json.yml/badge.svg)](https://github.com/joshhighet/transl8/actions/workflows/yml2json.yml)

transl8 exists to help build simple cross-platform queries across various internet search engines

two configuration files are used;

- [queries.csv](queries.csv) - a CSV file containing query definitions
- [providers.yml](providers.yml) - a YAML file containing search-provider data such as URL constructors

these files are converted to JSON through a set of GitHub Actions, the resulting files are ultimatley referenced by the web application

[joshhighet.github.io/transl8](https://joshhighet.github.io/transl8/)

---

official query syntax links;

- [zoomeye.org](https://www.zoomeye.org/doc?Thechannel=user)
- [binaryedge.io](https://docs.binaryedge.io/search/)
- [shodan.io](https://beta.shodan.io/search/filters)
- [censys.io](https://search.censys.io/search/definitions?resource=hosts)
- [fofa.info](https://en.fofa.info/api)
- [quake.360.net](https://quake.360.net/quake/#/help?id=5eb238f110d2e850d5c6aec8&title=检索关键词) - translated: [quake-360-net.translate.goog](https://quake-360-net.translate.goog/quake/?_x_tr_sl=ru&_x_tr_tl=en&_x_tr_hl=en-US&_x_tr_pto=wapp#/help?id=5eb238f110d2e850d5c6aec8&title=检索关键词)
- [netlas.io](https://app.netlas.io/responses/)
- [onyphe.io](https://www.onyphe.io/docs/onyphe-query-language)

to be completed;

- securitytrails
- greynoise
- criminalip
- virustotal

---
