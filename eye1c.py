#!/usr/bin/env python3
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
import logging

from core.lib.utils import *
from core.crawl.crawler import Crawler
from core.scan.scanner import Scanner

from core.util.util import Util


def split_argv(argv):
    argvs = []
    cur = 0
    for a in argv:
        if a == ";":
            cur += 1
            continue
        if len(argvs) == cur:
            argvs.append([])
        argvs[cur].append(a)
    return argvs


def usage():
    infos = get_program_infos()
    print((
        "htcap ver " + infos['version'] + "\n"
        "usage: htcap <command>\n"
        "commands are chainable using '\\;' and they share the same database\n"
        "  ex: htcap crawl http://htcap.org htcap.db \\; scan sqlmap \\; util report htcap.html\n"
        "Commands: \n"
        "  crawl                  run crawler\n"
        "  scan                   run scanner\n"
        "  util                   run utility\n"))


if __name__ == '__main__':
    logging.basicConfig(format='%(name)s|%(asctime)s :%(message)s',
                        level=logging.DEBUG,
                        datefmt='%m/%d/%Y %I:%M:%S %p',
                        filename='./log/app.log',
                        filemode='w+')
    logging.getLogger("requests").setLevel(logging.CRITICAL)
    logging.getLogger("urllib3.connectionpool").setLevel(logging.CRITICAL)
    logging.getLogger("urllib3.util.retry").setLevel(logging.CRITICAL)
    log = logging.Logger('htcap')

    node_dir = os.path.join(getrealdir(__file__), 'core', 'nodejs')
    env_sep = ':' if sys.platform != "win32" else ';'
    os.environ["NODE_PATH"] = env_sep.join(
        [node_dir, os.path.join(node_dir, 'node_modules')])

    if len(sys.argv) < 2:
        usage()
        sys.exit(1)

    argvs = split_argv(sys.argv[1:])
    for argv in argvs:
        if argv[0] not in ('crawl', 'scan', 'util'):
            print("Command not found: %s" % argv[0])
            sys.exit(1)
    cr = None
    sc = None
    for argv in argvs:

        if argv[0] == "crawl":
            cr = Crawler(argv[1:])
        elif argv[0] == "scan":
            if sc:
                dbfile = sc.db_file
            else:
                dbfile = cr.db_file if cr else None
            sc = Scanner(argv[1:], dbfile)
        elif argv[0] == "util":
            dbfile = cr.db_file if cr else (sc.db_file if sc else None)
            Util(argv[1:], dbfile)
    sys.exit(0)
