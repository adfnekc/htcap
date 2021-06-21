# -*- coding: utf-8 -*-
"""
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
"""

from core.lib.utils import *
from .shared import *
import posixpath
import json
import requests as req
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter
from urllib.parse import urlparse
import re
import logging
from core.crawl.lib.probe import Probe
from core.lib.request import Request

log = logging.getLogger('htcap')


def request_in_scope(request) -> bool:
    url = request.url
    purl = urlsplit(url)
    spurl = urlsplit(Shared.starturl)
    scope = Shared.options['scope']
    in_scope = False

    if not purl.hostname:  # malformed url
        return False

    # check for scopes
    if scope == CRAWLSCOPE_DOMAIN:
        for pattern in Shared.allowed_domains:
            if purl.hostname and re.match(pattern, purl.hostname):
                in_scope = True
                break

    elif scope == CRAWLSCOPE_DIRECTORY:
        if purl.hostname != spurl.hostname:
            in_scope = False
        else:
            path = [p for p in posixpath.dirname(purl.path).split("/") if p]
            spath = [p for p in posixpath.dirname(spurl.path).split("/") if p]
            in_scope = path[:len(spath)] == spath

    elif scope == CRAWLSCOPE_URL:
        in_scope = url == Shared.starturl

    # check for excluded urls
    for pattern in Shared.excluded_urls:
        if re.match(pattern, request.url):
            log.debug("[*] %s excluded by reg %s" % (request.url, pattern))
            in_scope = False
            break

    return in_scope


def adjust_requests(requests):
    """
    adjust an array of requsts according to current status/settings
    1. sets the out_of_scope property
    2. normalize url accoding to user settings
    """

    for request in requests:
        if request.type == REQTYPE_UNKNOWN or not request_in_scope(request):
            request.out_of_scope = True

        if Shared.options['group_qs']:
            request.url = group_qs_params(request.url)

    return requests


def request_depth(request):
    if request.parent is None:
        return 1

    return 1 + request_depth(request.parent)


def request_post_depth(request):
    if request.method != "POST":
        return 0

    if request.parent is None or request.parent.method != "POST":
        return 1

    return 1 + request_post_depth(request.parent)


def request_is_crawlable(request) -> bool:
    if request.out_of_scope:
        return False

    types = [REQTYPE_LINK, REQTYPE_REDIRECT, REQTYPE_NAV]
    if Shared.options['mode'] == CRAWLMODE_AGGRESSIVE and Shared.options[
            'crawl_forms']:
        types.append(REQTYPE_FORM)

    return request.type in types and re.match("^https?://", request.url, re.I)


class ProbeExecutor:
    """ parms request:Request
    """
    def __init__(self,
                 request: Request,
                 probe_basecmd: str = "",
                 cookie_file="",
                 out_file="",
                 login_sequence=None):
        self.request = request
        self.probe_basecmd = probe_basecmd
        self.cookie_file = cookie_file
        self.out_file = out_file
        self.login_sequence = login_sequence
        self.errors = []
        self.cmd = None

    def load_probe_json(self, jsn: str):
        jsn = jsn.strip()
        try:
            return json.loads(jsn)
        except Exception:
            log.error("-- JSON DECODE ERROR %s" % jsn)

    def terminate(self):
        if self.cmd:
            self.cmd.terminate()

    def execute(self, process_timeout=180) -> Probe:
        url = self.request.url
        path = urlparse(url).path

        if path in Shared.probe_req_path:
            if Shared.probe_req_path[path] > Shared.max_probe_path:
                log.debug(
                    "  [*filter] req placeholder GET %s filter by probe_req_path"
                    % url)
                return
            Shared.probe_req_path[path] += 1
        else:
            Shared.probe_req_path[path] = 1

        if url in Shared.probed_req_urls:
            log.debug(
                "  [*filter] req placeholder GET %s filter by probed_req_urls"
                % url)
            return
        Shared.probed_req_urls.add(url)
        probe = None

        out = probe_http(url, process_timeout)

        probeArray = self.load_probe_json(out)
        if probeArray:
            probe = Probe(probeArray, self.request)
        return probe
        # if err or not jsn:
        #     print(err)
        #     self.errors.append(ERROR_PROBEKILLED)
        #     if not jsn:
        #         break

        # # try to decode json also after an exception .. sometimes phantom crashes BUT returns a valid json ..
        # try:
        #     if jsn and type(jsn) is not str:
        #         jsn = jsn[0]
        #     probeArray = self.load_probe_json(jsn)
        # except Exception as e:
        #     raise e

        # if probeArray:
        #     probe = Probe(probeArray, self.request)

        #     if probe.status == "ok":
        #         break

        #     self.errors.append(probe.errcode)

        #     if probe.errcode in (ERROR_CONTENTTYPE, ERROR_PROBE_TO):
        #         break

        # time.sleep(0.5)
        # retries -= 1

    # return probe


def probe_http(url: str, timeout: int) -> str:
    log.debug("get -> %s" % url)
    url = req.utils.quote(url, safe='~()*!.\'')
    url = "http://" + Shared.node_host + "/url/" + url

    retries = Retry(total=10, backoff_factor=0.5)
    s = req.Session()
    # prevent error cause by requests detect system proxy
    s.trust_env = False
    s.mount('http://', HTTPAdapter(max_retries=retries))
    res = s.get(url, timeout=timeout)

    if res.status_code == 200:
        return res.text
    else:
        log.error("err in res:%s" % res.content)
        return ""
