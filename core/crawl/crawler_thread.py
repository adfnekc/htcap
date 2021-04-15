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


def save_log(text: str):
    with open("./log/thearding.log", "a+") as f:
        f.write(text + "\r\n")


class CrawlerThread(threading.Thread):
    def __init__(self, name):
        threading.Thread.__init__(self)
        self._name = name
        self.thread_uuid = uuid.uuid4()

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

    def __acquire(self):
        save_log("Thread %s __acquire" % self._name)
        Shared.th_condition.acquire()

    def __notifyAll(self):
        save_log("Thread %s __notifyAll" % self._name)
        Shared.th_condition.notifyAll()

    def __release(self):
        save_log("Thread %s __release" % self._name)
        Shared.th_condition.release()

    def __wait(self):
        save_log("Thread %s __wait" % self._name)
        Shared.th_condition.wait(1 / 10)

    def wait_request(self):
        request = None
        self.__acquire()
        while True:
            if self.exit:
                self.__notifyAll()
                self.__release()
                raise ThreadExitRequestException("exit request received")

            if Shared.requests_index >= len(Shared.requests):
                self.status = THSTAT_WAITING
                # The wait method releases the lock, blocks the current thread until another thread calls notify
                self.__wait()
                continue

            request = Shared.requests[Shared.requests_index]
            Shared.requests_index += 1
            break

        self.__release()
        self.status = THSTAT_RUNNING
        return request

    def send_probe(self, request, errors):
        ls = Shared.options['login_sequence']
        if ls and ls['type'] != LOGSEQTYPE_STANDALONE:
            ls = None
        self.probe_executor = ProbeExecutor(request)
        probe = self.probe_executor.execute(
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
            if self.exit:
                return

            requests = []
            errors = []

            try:
                request = self.wait_request()
            except ThreadExitRequestException:
                if os.path.exists(self.cookie_file):
                    os.remove(self.cookie_file)
                return
            except Exception as e:
                print("crawl_thread err -->" + e)
                continue

            probe = self.send_probe(request, errors)

            if probe:
                requests = probe.requests
                if probe.html:
                    request.html = probe.html
                if probe.page_hash:
                    request.page_hash = probe.page_hash
                if len(probe.user_output) > 0:
                    request.user_output = probe.user_output
                errors.append(probe.errmessage)

            else:
                errors.append(ERROR_PROBEFAILURE)
                # get urls with python to continue crawling
                if not Shared.options['use_urllib_onerror']:
                    continue
                try:
                    hr = HttpGet(request, Shared.options['process_timeout'],
                                 1,
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
