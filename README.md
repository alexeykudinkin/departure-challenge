Departure Times Challenge (Backend Track)
=========================================

Implementation
--------------
It's implemented using almost 'bare-metal' ExpressJS http-server.

The whole backend consists of the three tiers:

1. Streaming Tier:      Responsible for extracting the Data directly from external API

2. Rate-limiting Tier:  Responsible for the rate-limiting amount of queries (per minute) towards the external API. It shields
                        the external API from the (potentially) overwhelming amount of the requests in the case of the latter
                        experiencing technical problems being unable to report data properly (for example returning errors, or
                        empty responses), which in turn cause caching tier to ignore them.

3. Caching Tier:        Responsible for storing the Data queried from external API (according to respective
                        caching policies), reducing the querying-pressure on external API and greatly reducing latency*


*To further reduce latency caching backend could be followed by the memory-caching tier encapsulating some of the
mem-caching engines like `memcache`, `redis` or alike. I've not implemented this since i've pretty tight timeframe
for the challenge (due to the schedule of my own), though its' mostly trivial step.


Obstacles
---------
Unfortunately only one of the selected SF Transportation Data Providers were accessible from Russia directly -- 511.com.
Nextbus was constantly delivering 'Access denied' for any request made (even nextbus.com is unavailable from out here).

Though, 511's API has downsides of its own too: it doesn't provide any flavour of spatial coordinates for the stops served,
therefore greatly impeding my abilities to provide API which finds among the full list of stops the closest ones to the User 
(geo-localizing them). Nevertheless, do 511 provide spatial coordinates (or be there any other way to obtain them), the
task of fast (spatial) lookup (for the geo-localization purposes) would be solved by the means of the MongoDB's native 
*spatial* indexes (https://docs.mongodb.org/manual/applications/geospatial-indexes/).

Also, constant problems being observed related to the 511's abilities to provide departure times itselves.

Comments
--------
There are almost no boilerplate out there. 100% of code (under the directory `./src`) is hand-crafted.
