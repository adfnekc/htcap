# -*- coding: utf-8 -*-
"""
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
"""

import sys
import os
import time
import getopt
import json
import re
import logging
import uuid
import subprocess
from urllib.parse import urlsplit
import urllib.request
import urllib.error
import urllib.parse
import threading
from random import choice
import string
import ssl

from core.lib.exception import *
from core.lib.cookie import Cookie
from core.lib.database import Database

from .lib.shared import *
from .lib.crawl_result import *
from core.lib.request import Request
from core.lib.http_get import HttpGet

from typing import List
from .crawler_thread import CrawlerThread
# from core.lib.shingleprint import ShinglePrint
from core.lib.texthash import TextHash
from core.lib.request_pattern import RequestPattern
from core.lib.utils import *
from core.constants import *
from .lib.utils import *


class Crawler:
    def __init__(self, argv):

        self.base_dir = getrealdir(__file__) + os.sep

        self.crawl_start_time = int(time.time())
        self.crawl_end_time = 0
        self.page_hashes = []
        self.request_patterns = []
        self.db_file = ""
        self.display_progress = True
        self.verbose = False
        self.defaults = {
            "useragent":
            'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3582.0 Safari/537.36',
            "num_threads": 10,
            "max_redirects": 10,
            "out_file_overwrite": False,
            "proxy": None,
            "http_auth": None,
            "use_urllib_onerror": True,
            "group_qs": False,
            "process_timeout": 300,
            "scope": CRAWLSCOPE_DOMAIN,
            "mode": CRAWLMODE_AGGRESSIVE,
            "max_depth": 100,
            "max_post_depth": 10,
            "override_timeout_functions": True,
            'crawl_forms': True,  # only if mode == CRAWLMODE_AGGRESSIVE
            'deduplicate_pages': True,
            'headless_chrome': True,
            'extra_headers': False,
            'local_storage': False,
            'login_sequence': None,
            'simulate_real_events': True
        }

        self.main(argv)

    def usage(self):
        infos = get_program_infos()
        print((
            "htcap crawler ver " + infos['version'] + "\n"
            "usage: crawl [options] url outfile\n"
            "hit ^C to pause the crawler or change verbosity\n"
            "Options: \n"
            "  -h               this help\n"
            "  -w               overwrite output file\n"
            "  -q               do not display progress informations\n"
            "  -v               be verbose\n"
            "  -m MODE          set crawl mode:\n"
            "                      - " + CRAWLMODE_PASSIVE +
            ": do not intract with the page\n"
            "                      - " + CRAWLMODE_ACTIVE +
            ": trigger events\n"
            "                      - " + CRAWLMODE_AGGRESSIVE +
            ": also fill input values and crawl forms (default)\n"
            "  -s SCOPE         set crawl scope\n"
            "                      - " + CRAWLSCOPE_DOMAIN +
            ": limit crawling to current domain (default)\n"
            "                      - " + CRAWLSCOPE_DIRECTORY +
            ": limit crawling to current directory (and subdirecotries) \n"
            "                      - " + CRAWLSCOPE_URL +
            ": do not crawl, just analyze a single page\n"
            "  -D               maximum crawl depth (default: " +
            str(Shared.options['max_depth']) + ")\n"
            "  -P               maximum crawl depth for consecutive forms (default: "
            + str(Shared.options['max_post_depth']) + ")\n"
            "  -F               even if in aggressive mode, do not crawl forms\n"
            "  -H               save HTML generated by the page\n"
            "  -d DOMAINS       comma separated list of allowed domains (ex *.target.com)\n"
            "  -c COOKIES       cookies as json or name=value pairs separaded by semicolon\n"
            "  -C COOKIE_FILE   path to file containing COOKIES \n"
            "  -r REFERER       set initial referer\n"
            "  -x EXCLUDED      comma separated list of urls to exclude (regex) - ie logout urls\n"
            "  -p PROXY         proxy string protocol:host:port -  protocol can be 'http' or 'socks5'\n"
            "  -n THREADS       number of parallel threads (default: " +
            str(self.defaults['num_threads']) + ")\n"
            "  -A CREDENTIALS   username and password used for HTTP authentication separated by a colon\n"
            "  -U USERAGENT     set user agent\n"
            "  -t TIMEOUT       maximum seconds spent to analyze a page (default "
            + str(self.defaults['process_timeout']) + ")\n"
            "  -G               group query_string parameters with the same name ('[]' ending excluded)\n"
            "  -N               don't normalize URL path (keep ../../)\n"
            "  -R               maximum number of redirects to follow (default "
            + str(self.defaults['max_redirects']) + ")\n"
            "  -O               dont't override timeout functions (setTimeout, setInterval)\n"
            "  -e               disable hEuristic page deduplication\n"
            "  -l               do not run chrome in headless mode\n"
            "  -E HEADER        set extra http headers (ex -E foo=bar -E bar=foo)\n"
            "  -g KEY/VALUE     set browser's Local/Session storaGe (ex -g L:foo=bar -g S:bar=foo)\n"
            "  -M               don't simulate real mouse/keyboard events\n"
            "  -L SEQUENCE      set login sequence\n"))

    def generate_filename(self, name, out_file_overwrite):
        fname = generate_filename(name, None, out_file_overwrite)
        if out_file_overwrite:
            if os.path.exists(fname):
                os.remove(fname)

        return fname

    def kill_threads(self, threads):
        Shared.th_condition.acquire()
        for th in threads:
            if th.isAlive():
                th.exit = True
                th.pause = False
                if th.probe_executor and th.probe_executor.cmd:
                    th.probe_executor.cmd.terminate()
        Shared.th_condition.release()

        # start notify() chain
        Shared.th_condition.acquire()
        Shared.th_condition.notifyAll()
        Shared.th_condition.release()

    def pause_threads(self, threads, pause):
        Shared.th_condition.acquire()
        for th in threads:
            if th.isAlive():
                th.pause = pause
        Shared.th_condition.release()

    def init_db(self, dbname, report_name):
        infos = {
            "target": Shared.starturl,
            "scan_date": -1,
            "urls_scanned": -1,
            "scan_time": -1,
            'command_line': " ".join(sys.argv)
        }

        database = Database(dbname, report_name, infos)
        database.create()
        return database

    def check_startrequest(self, request):

        h = HttpGet(request, Shared.options['process_timeout'], 2,
                    Shared.options['useragent'], Shared.options['proxy'])
        try:
            h.get_requests()
        except NotHtmlException:
            print("\nError: Document is not html")
            sys.exit(1)
        except Exception as e:
            print("\nError: unable to open url: %s" % e)
            sys.exit(1)

    def get_requests_from_robots(self, request):
        purl = urlsplit(request.url)
        url = "%s://%s/robots.txt" % (purl.scheme, purl.netloc)

        getreq = Request(REQTYPE_LINK,
                         "GET",
                         url,
                         extra_headers=Shared.options['extra_headers'])
        try:
            # request, timeout, retries=None, useragent=None, proxy=None):
            httpget = HttpGet(getreq, 10, 1, "Googlebot",
                              Shared.options['proxy'])
            lines = httpget.get_file().split("\n")
        except urllib.error.HTTPError:
            return []
        except:
            return []
            # raise

        requests = []
        for line in lines:
            directive = ""
            url = None
            try:
                directive, url = re.sub("\\#.*", "", line).split(":", 1)
            except:
                continue  # ignore errors

            if re.match("(dis)?allow", directive.strip(), re.I):
                req = Request(REQTYPE_LINK, "GET", url.strip(), parent=request)
                requests.append(req)

        return adjust_requests(requests) if requests else []

    def randstr(self, length):
        all_chars = string.digits + string.ascii_letters + string.punctuation
        random_string = ''.join(choice(all_chars) for _ in range(length))
        return random_string

    def request_is_duplicated(self, page_hash):
        for h in self.page_hashes:
            if TextHash.compare(page_hash, h):
                return True
        return False

    def main_loop(self, threads, start_requests, database):
        pending = len(start_requests)
        crawled = 0
        # pb = Progressbar(self.crawl_start_time, "pages processed")
        req_to_crawl = start_requests
        while True:
            try:
                # if self.display_progress and not self.verbose:
                #     tot = (crawled + pending)
                #     pb.out(tot, crawled)

                if pending == 0:
                    # is the check of running threads really needed?
                    running_threads = [
                        t for t in threads if t.status == THSTAT_RUNNING
                    ]
                    if len(running_threads) == 0:
                        if self.display_progress or self.verbose:
                            print("no running_threads")
                        break

                if len(req_to_crawl) > 0:
                    Shared.th_condition.acquire()
                    Shared.requests.extend(req_to_crawl)
                    Shared.th_condition.notifyAll()
                    Shared.th_condition.release()

                req_to_crawl = []
                Shared.main_condition.acquire()
                Shared.main_condition.wait(1)
                if len(Shared.crawl_results) > 0:
                    database.connect()
                    database.begin()
                    for result in Shared.crawl_results:
                        crawled += 1
                        pending -= 1
                        if self.verbose:
                            logging.debug("crawl result for: %s " %
                                          result.request)
                            if len(result.request.user_output) > 0:
                                print("  user: %s" %
                                      json.dumps(result.request.user_output))
                            if result.errors:
                                print("* crawler errors: %s" %
                                      ", ".join(result.errors))

                        database.save_crawl_result(result, True)

                        if Shared.options['deduplicate_pages']:
                            if self.request_is_duplicated(result.page_hash):
                                filtered_requests = []
                                for r in result.found_requests:
                                    if RequestPattern(
                                            r
                                    ).pattern not in self.request_patterns:
                                        filtered_requests.append(r)
                                result.found_requests = filtered_requests
                                if self.verbose:
                                    print(
                                        " * marked as duplicated ... requests filtered"
                                    )

                            self.page_hashes.append(result.page_hash)
                            for r in result.found_requests:
                                self.request_patterns.append(
                                    RequestPattern(r).pattern)

                        for req in result.found_requests:

                            database.save_request(req)

                            if self.verbose and req not in Shared.requests and req not in req_to_crawl:
                                logging.debug("  new request found %s" % req)

                            if request_is_crawlable(
                                    req
                            ) and req not in Shared.requests and req not in req_to_crawl:

                                if request_depth(req) > Shared.options[
                                        'max_depth'] or request_post_depth(
                                            req
                                        ) > Shared.options['max_post_depth']:
                                    if self.verbose:
                                        print(
                                            "  * cannot crawl: %s : crawl depth limit reached"
                                            % req)
                                    result = CrawlResult(
                                        req, errors=[ERROR_CRAWLDEPTH])
                                    database.save_crawl_result(result, False)
                                    continue

                                if req.redirects > Shared.options[
                                        'max_redirects']:
                                    if self.verbose:
                                        print(
                                            "  * cannot crawl: %s : too many redirects"
                                            % req)
                                    result = CrawlResult(
                                        req, errors=[ERROR_MAXREDIRECTS])
                                    database.save_crawl_result(result, False)
                                    continue

                                pending += 1
                                req_to_crawl.append(req)

                    Shared.crawl_results = []
                    database.commit()
                    database.close()
                Shared.main_condition.release()

            except KeyboardInterrupt:
                try:
                    Shared.main_condition.release()
                    Shared.th_condition.release()
                except Exception as e:
                    print("main_condition.release.. " + str(e))
                self.pause_threads(threads, True)
                if not self.get_runtime_command():
                    print("Exiting . . .")
                    return
                print("Crawler is running")
                self.pause_threads(threads, False)

    def get_runtime_command(self):
        while True:
            print("\nCrawler is paused.\n"
                  "   r    resume\n"
                  "   v    verbose mode\n"
                  "   p    show progress bar\n"
                  "   q    quiet mode\n"
                  "Hit ctrl-c again to exit\n")
            try:
                ui = input("> ").strip()
            except KeyboardInterrupt:
                print("")
                return False

            if ui == "r":
                break
            elif ui == "v":
                self.verbose = True
                break
            elif ui == "p":
                self.display_progress = True
                self.verbose = False
                break
            elif ui == "q":
                self.verbose = False
                self.display_progress = False
                break
            print(" ")

        return True

    def main(self, argv):
        Shared.options = self.defaults
        Shared.th_condition = threading.Condition()
        Shared.main_condition = threading.Condition()

        # deps_errors = check_dependences(self.base_dir)
        # if len(deps_errors) > 0:
        # 	print("Dependences errors: ")
        # 	for err in deps_errors:
        # 		print("  %s" % err)
        # 	sys.exit(1)

        start_cookies = []
        start_referer = None

        probe_options = ["-R", self.randstr(20)]
        threads = []
        num_threads = self.defaults['num_threads']

        out_file = ""
        out_file_overwrite = self.defaults['out_file_overwrite']
        cookie_string = None
        http_auth = None
        save_html = False

        try:
            opts, args = getopt.getopt(
                argv, 'hc:t:jn:x:A:p:d:BGR:U:wD:s:m:C:qr:SIHFP:OvelE:L:Mg:')
        except getopt.GetoptError as err:
            print("GetoptError", str(err))
            sys.exit(1)

        if len(args) < 2:
            self.usage()
            sys.exit(1)

        for o, v in opts:
            if o == '-h':
                self.usage()
                sys.exit(0)
            elif o == '-c':
                cookie_string = v
            elif o == '-C':
                try:
                    with open(v) as cf:
                        cookie_string = cf.read()
                except Exception as e:
                    print("error reading cookie file" + e)
                    sys.exit(1)
            elif o == '-r':
                start_referer = v
            elif o == '-n':
                num_threads = int(v)
            elif o == '-t':
                Shared.options['process_timeout'] = int(v)
            elif o == '-q':
                self.display_progress = False
            elif o == '-A':
                http_auth = v
            elif o == '-p':
                try:
                    Shared.options['proxy'] = parse_proxy_string(v)
                except Exception as e:
                    print(e)
                    sys.exit(1)
            elif o == '-d':
                for ad in v.split(","):
                    # convert *.domain.com to *.\.domain\.com
                    pattern = re.escape(ad).replace("\\*\\.", "((.*\\.)|)")
                    Shared.allowed_domains.add(pattern)
            elif o == '-x':
                for eu in v.split(","):
                    try:
                        re.match(eu, "")
                    except:
                        print("* ERROR: regex failed: %s" % eu)
                        sys.exit(1)
                    Shared.excluded_urls.add(eu)
            elif o == "-G":
                Shared.options['group_qs'] = True
            elif o == "-w":
                out_file_overwrite = True
            elif o == "-R":
                Shared.options['max_redirects'] = int(v)
            elif o == "-U":
                Shared.options['useragent'] = v
            elif o == "-s":
                if v not in (CRAWLSCOPE_DOMAIN, CRAWLSCOPE_DIRECTORY,
                             CRAWLSCOPE_URL):
                    self.usage()
                    print("* ERROR: wrong scope set '%s'" % v)
                    sys.exit(1)
                Shared.options['scope'] = v
            elif o == "-m":
                if v not in (CRAWLMODE_PASSIVE, CRAWLMODE_ACTIVE,
                             CRAWLMODE_AGGRESSIVE):
                    self.usage()
                    print("* ERROR: wrong mode set '%s'" % v)
                    sys.exit(1)
                Shared.options['mode'] = v
            elif o == "-H":
                save_html = True
            elif o == "-D":
                Shared.options['max_depth'] = int(v)
            elif o == "-P":
                Shared.options['max_post_depth'] = int(v)
            elif o == "-O":
                Shared.options['override_timeout_functions'] = False
            elif o == "-F":
                Shared.options['crawl_forms'] = False
            elif o == "-v":
                self.verbose = True
            elif o == "-e":
                Shared.options['deduplicate_pages'] = False
            elif o == "-l":
                Shared.options['headless_chrome'] = False
            elif o == "-M":
                Shared.options['simulate_real_events'] = False
            elif o == "-E":
                if not Shared.options['extra_headers']:
                    Shared.options['extra_headers'] = {}
                (hn, hv) = v.split("=", 1)
                Shared.options['extra_headers'][hn] = hv
            elif o == "-L":
                try:
                    with open(v) as cf:
                        Shared.options['login_sequence'] = json.loads(
                            cf.read())
                        Shared.options['login_sequence'][
                            "__file__"] = os.path.abspath(v)
                except ValueError as e:
                    print("* ERROR: decoding login sequence" + e)
                    sys.exit(1)
                except Exception as e:
                    print("* ERROR: login sequence file not found" + e)
                    sys.exit(1)
            elif o == "-g":
                if not Shared.options['local_storage']:
                    Shared.options['local_storage'] = {}
                (hn, hv) = v.split("=", 1)
                ktks = hn.split(":", 1)
                if len(ktks) != 2 or ktks[0] not in ("L", "S"):
                    print(
                        "Error: the -g option must be in the form '[L|S]:key=value', use 'L' to set locaStorage and 'S' to set sessionStorage"
                    )
                    sys.exit(1)
                Shared.options['local_storage'][ktks[1]] = {
                    "type": ktks[0],
                    "value": hv
                }

        probe_cmd = get_node_cmd()
        if not probe_cmd:  # maybe useless
            print("Error: unable to find node executable")
            sys.exit(1)

        if Shared.options['scope'] != CRAWLSCOPE_DOMAIN and len(
                Shared.allowed_domains) > 0:
            print("* Warinig: option -d is valid only if scope is %s" %
                  CRAWLSCOPE_DOMAIN)

        if cookie_string:
            try:
                start_cookies = parse_cookie_string(cookie_string)
            except Exception as e:
                print("error decoding cookie string" + e)
                sys.exit(1)

        if Shared.options['mode'] != CRAWLMODE_AGGRESSIVE:
            probe_options.append("-f")  # dont fill values
        if Shared.options['mode'] == CRAWLMODE_PASSIVE:
            probe_options.append("-t")  # dont trigger events

        if Shared.options['proxy']:
            probe_options.extend([
                "-y",
                "%s:%s:%s" % (Shared.options['proxy']['proto'],
                              Shared.options['proxy']['host'],
                              Shared.options['proxy']['port'])
            ])
        if not Shared.options['headless_chrome']:
            probe_options.append("-l")

        probe_cmd.append(os.path.join(self.base_dir, 'probe', 'analyze.js'))

        if len(Shared.excluded_urls) > 0:
            probe_options.extend(("-X", ",".join(Shared.excluded_urls)))

        if save_html:
            probe_options.append("-H")

        probe_options.extend(("-x", str(Shared.options['process_timeout'])))
        probe_options.extend(("-A", Shared.options['useragent']))
        probe_options.extend(("-n", str(num_threads)))

        if not Shared.options['override_timeout_functions']:
            probe_options.append("-O")

        if Shared.options['extra_headers']:
            probe_options.extend(
                ["-E", json.dumps(Shared.options['extra_headers'])])

        if Shared.options['local_storage']:
            probe_options.extend(
                ["-g", json.dumps(Shared.options['local_storage'])])

        if not Shared.options['simulate_real_events']:
            probe_options.append("-M")

        Shared.probe_cmd = probe_cmd + probe_options

        Shared.starturl = normalize_url(args[0])
        out_file = args[1]

        purl = urlsplit(Shared.starturl)
        Shared.allowed_domains.add(purl.hostname)

        for sc in start_cookies:
            Shared.start_cookies.append(Cookie(sc, Shared.starturl))

        start_req = Request(REQTYPE_LINK,
                            "GET",
                            Shared.starturl,
                            set_cookie=Shared.start_cookies,
                            http_auth=http_auth,
                            referer=start_referer,
                            extra_headers=Shared.options['extra_headers'])

        if not hasattr(ssl, "SSLContext"):
            print(
                "* WARNING: SSLContext is not supported with this version of python, consider to upgrade to >= 2.7.9 in case of SSL errors"
            )

        start_requests = [start_req]

        database = None
        self.db_file = self.generate_filename(out_file, out_file_overwrite)
        try:
            database = self.init_db(self.db_file, out_file)
        except Exception as e:
            print(str(e))
            sys.exit(1)

        database.save_crawl_info(
            htcap_version=get_program_infos()['version'],
            target=Shared.starturl,
            start_date=self.crawl_start_time,
            commandline=cmd_to_str(argv),
            user_agent=Shared.options['useragent'],
            proxy=json.dumps(Shared.options['proxy']),
            extra_headers=json.dumps(Shared.options['extra_headers']),
            cookies=json.dumps([x.get_dict() for x in Shared.start_cookies]))

        database.connect()
        database.begin()
        for req in start_requests:
            database.save_request(req)
        database.commit()
        database.close()

        node_process, cookie_file = start_node(Shared.probe_cmd,
                                               cookieList=Shared.start_cookies)

        print(
            "Database %s initialized, crawl started with %d threads (^C to pause or change verbosity)"
            % (self.db_file, num_threads))

        for n in range(0, num_threads):
            thread = CrawlerThread(n)
            threads.append(thread)
            thread.start()

        self.main_loop(threads, start_requests, database)

        self.kill_threads(threads)
        node_process.terminate()

        self.crawl_end_time = int(time.time())

        print("Crawl finished, %d pages analyzed in %d minutes" %
              (Shared.requests_index,
               (self.crawl_end_time - self.crawl_start_time) // 60))

        database.save_crawl_info(end_date=self.crawl_end_time)


def start_node(cmd: List[str],
               cookieList: List[Cookie] = None) -> (subprocess.Popen, str):
    cookieList = [c for c in cookieList if c.is_valid_for_url(Shared.starturl)]
    cookie_file = "/tmp/htcap_cookie_%s.json" % (uuid.uuid4())

    cookies = []
    if len(cookieList) > 0:
        for c in cookieList:
            cookie = c.get_dict()
            if not cookie['domain']:
                purl = urlsplit(Shared.starturl)
                cookie['domain'] = purl.netloc.split(":")[0]
            cookies.append(cookie)

        logging.debug("cookie:%s write to file <%s>" % (cookies, cookie_file))
        with open(cookie_file, 'w') as fil:
            fil.write(json.dumps(cookies))

    cmd.extend(["-c", cookie_file])
    with open("./log/node.log", "w+") as f:
        node_process = subprocess.Popen(cmd,
                                        stdout=f,
                                        stderr=f,
                                        text=True,
                                        cwd=os.path.dirname(cmd[1]))
    logging.debug("cmd:%s,cwd:%s" % (cmd, os.path.dirname(cmd[1])))
    time.sleep(5)
    return node_process, cookie_file
