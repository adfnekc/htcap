# -*- coding: utf-8 -*-
"""
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under 
the terms of the GNU General Public License as published by the Free Software 
Foundation; either version 2 of the License, or (at your option) any later 
version.
"""

import json
from core.lib.request import Request
from core.lib.cookie import Cookie
from core.constants import *
from core.lib.texthash import TextHash


class Probe:
    def __init__(self, data, parent):
        self.status = "ok"
        self.requests = []
        self.cookies = []
        self.redirect = []
        self.errmessage = ""
        # if True the probe returned no error BUT the json is not closed properly
        self.partialcontent = False
        self.html = None
        self.user_output = []
        self.page_hash = 0

        status = data["status"]

        if status == "error":
            self.status = "error"
            self.errmessage = data["errors"]

        # grap cookies before creating rquests
        for cookie in data["cookies"]:
            self.cookies.append(Cookie(cookie, parent.url))

        for redirect in data['redirect']:
            r = Request(REQTYPE_REDIRECT,
                        "GET",
                        redirect,
                        parent=parent,
                        set_cookie=self.cookies,
                        parent_db_id=parent.db_id)
            self.redirect.append(r)

        requests = data["requests"]
        for request in requests:
            request = json.loads(request)
            r = Request(request['type'],
                        request['method'],
                        request['url'],
                        parent=parent,
                        parent_db_id=parent.db_id,
                        set_cookie=self.cookies,
                        data=request['data'],
                        trigger=request.get("trigger", None),
                        extra_headers=request.get("extra_headers", None))
            self.requests.append(r)
        #except Exception as e:
        #	pass
        # elif key == "html":
        #     self.html = val
        # elif key == "page_hash":
        #     page_hash = TextHash(val).hash
        #     self.page_hash = page_hash if page_hash else 0
        # elif key == "user":
        #     self.user_output.append(val)

    # @TODO handle cookies set by ajax (in probe too)
