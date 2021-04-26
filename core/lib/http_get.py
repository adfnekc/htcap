# -*- coding: utf-8 -*-
"""
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
"""

import requests as reqlib
from core.crawl.lib.urlfinder import get_urls
from core.lib.exception import *
from core.lib.request import Request
from core.lib.utils import *
from core.constants import *


class HttpGet:
    def __init__(self,
                 request: Request,
                 timeout: int,
                 retries=None,
                 useragent=None,
                 proxy=None,
                 extra_headers=None):
        self.request = request
        self.timeout = timeout
        self.retries = retries if retries else 1
        self.proxy = parse_proxy_string(proxy) if isinstance(proxy,
                                                             str) else proxy
        self.retries_interval = 0.5
        self.useragent = useragent
        self.extra_headers = extra_headers if extra_headers else {}

    def get_requests(self):
        requests = []

        try:
            headers = {
                "user-agent": self.useragent,
            }
            headers.update(self.extra_headers)

            print(self.request.cookies, type(self.request.cookies))
            res = reqlib.request(method=self.request.method,
                                 url=self.request.url,
                                 verify=False,
                                 timeout=self.timeout,
                                 cookies=toReqCok(self.request.cookies),
                                 proxies=self.proxy)
        except Exception as e:
            raise e

        print("HttpGet get_requests ===>", self.request.url, res.status_code,
              len(res.text))

        if res.headers["content-type"] is not None and res.headers[
                'content-type'].lower().split(";")[0] != "text/html":
            raise NotHtmlException(ERROR_CONTENTTYPE)

        if res.content is None:
            raise NotHtmlException

        try:
            urls = get_urls(res.text)
            for url in urls:
                # @TODO handle FORMS
                requests.append(
                    Request(REQTYPE_LINK,
                            "GET",
                            url,
                            parent=self.request,
                            set_cookie=res.headers["set_cookie"],
                            parent_db_id=self.request.db_id))
        except Exception as e:
            raise e

        return requests

    def send_request(self,
                     method=None,
                     url=None,
                     data=None,
                     cookies=None,
                     ignore_errors=False,
                     follow_redirect=False):
        print("HttpGET -> send_request", method, url, data, cookies,
              ignore_errors, follow_redirect)

    def get_file(self, url=None):
        if url is None:
            url = self.request.url
        try:
            res = reqlib.request(method=self.request.method,
                                 url=url,
                                 verify=False,
                                 timeout=self.timeout,
                                 cookies=self.request.cookies,
                                 proxies=self.proxy)
            print("HttpGet get_file ===>", url, res.status_code, len(res.text))
        except Exception as e:
            raise e
        return res.text()


def toReqCok(cookies: list):
    c = {}
    for cookie in cookies:
        c[cookie.name] = cookie.value
    return c
