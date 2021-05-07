# 执行命令
    python htcap.py crawl [OPTION]... URL DB  
### URL:
要爬取的网页地址

### DB:
数据存储地址

### OPTION:
 - -c COOKIES: 指定cookies,多条cookies之间以**英文分号**分隔,示例: "a=b;t=a"
 - -x EXCLUDED: 排除的扫描的匹配规则(支持**正则**),以**英文逗号**分隔，当url匹配其中一条时，将会直接跳过,示例: "logout,forgetpassword"
 - -p PROXY : 指定代理，支持http和socks5代理,示例: "http:127.0.0.1:1080"
 - -n THREADS : 并行线程数,示例:3
 - -A CREDENTIALS : HTTP authentication,示例:"Basic YWRtaW46YWRtaW4="
 - -U USERAGENT : 设置浏览器user-agent,示例: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.85 Safari/537.36"
 - -l : 使用非headless模式，将会显示浏览器，对性能有影响,默认不显示
 - -w : 覆盖写入DB


# 示例:
    python htcap.py crawl 127.0.0.1:80 output.db  
    python htcap.py crawl -w -c "a=b" -x logout,login -n 5 127.0.0.1:80 output.db






