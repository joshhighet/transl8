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

current engines;

- zoomeye.org
- censys.io
- fofa.info
- quake.360.net
- netlas.io
- onyphe.io

to be completed;

- securitytrails
- greynoise
- criminalip
- virustotal

---
