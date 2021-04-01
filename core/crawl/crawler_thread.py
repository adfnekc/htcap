# -*- coding: utf-8 -*-
"""
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
"""

import time
import threading

import tempfile
import os
import uuid

from core.lib.exception import *
from core.crawl.lib.shared import *

from core.lib.http_get import HttpGet

from core.lib.utils import *
from core.constants import *

from .lib.utils import *
from .lib.utils import ProbeExecutor
from .lib.crawl_result import *


class CrawlerThread(threading.Thread):
    def __init__(self):
        threading.Thread.__init__(self)
        self.thread_uuid = uuid.uuid4()
        self.process_retries = 2
        self.process_retries_interval = 0.5

        self.status = THSTAT_RUNNING
        self.exit = False
        self.pause = False

        self.cookie_file = "%s%shtcap_cookiefile-%s.json" % (
            tempfile.gettempdir(), os.sep, self.thread_uuid)
        self.out_file = "%s%shtcap_output-%s.json" % (tempfile.gettempdir(),
                                                      os.sep, self.thread_uuid)
        self.probe_executor = ProbeExecutor(None, None)

    def run(self):
        self.crawl()

    def wait_request(self):
        request = None
        Shared.th_condition.acquire()
        while True:
            if self.exit:
                Shared.th_condition.notifyAll()
                Shared.th_condition.release()
                raise ThreadExitRequestException("exit request received")

            if Shared.requests_index >= len(Shared.requests):
                self.status = THSTAT_WAITING
                # The wait method releases the lock, blocks the current thread until another thread calls notify
                Shared.th_condition.wait()
                continue

            request = Shared.requests[Shared.requests_index]
            Shared.requests_index += 1

            break

        Shared.th_condition.release()

        self.status = THSTAT_RUNNING

        return request

    def send_probe(self, request, errors):
        ls = Shared.options['login_sequence']
        if ls and ls['type'] != LOGSEQTYPE_STANDALONE:
            ls = None
        self.probe_executor = ProbeExecutor(request,
                                            Shared.probe_cmd,
                                            cookie_file=self.cookie_file,
                                            out_file=self.out_file,
                                            login_sequence=ls)
        probe = self.probe_executor.execute(
            retries=self.process_retries,
            process_timeout=Shared.options['process_timeout'])
        errors.extend(self.probe_executor.errors)
        return probe

    def wait_pause(self):
        while True:
            Shared.th_condition.acquire()
            paused = self.pause
            Shared.th_condition.release()
            if not paused:
                break
            time.sleep(0.5)

    def crawl(self):

        while True:
            requests = []
            errors = []

            try:
                request = self.wait_request()
            except ThreadExitRequestException:
                if os.path.exists(self.cookie_file):
                    os.remove(self.cookie_file)
                return
            except Exception as e:
                print("-->" + str(e))
                continue

            probe = self.send_probe(request, errors)

            if probe:
                if probe.status == "ok":

                    requests = probe.requests

                    if probe.html:
                        request.html = probe.html

                    if len(probe.user_output) > 0:
                        request.user_output = probe.user_output

            else:
                errors.append(ERROR_PROBEFAILURE)
                # get urls with python to continue crawling
                if not Shared.options['use_urllib_onerror']:
                    continue
                try:
                    hr = HttpGet(request, Shared.options['process_timeout'],
                                 self.process_retries,
                                 Shared.options['useragent'],
                                 Shared.options['proxy'],
                                 Shared.options['extra_headers'])
                    requests = hr.get_requests()
                except Exception as e:
                    errors.append(str(e))

            # set out_of_scope, apply user-supplied filters to urls (ie group_qs)
            requests = adjust_requests(requests)

            Shared.main_condition.acquire()
            res = CrawlResult(request, requests, errors,
                              probe.page_hash if probe else "")
            Shared.crawl_results.append(res)
            Shared.main_condition.notify()
            Shared.main_condition.release()

            self.wait_pause()
