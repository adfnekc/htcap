TODO
========
- 添加是否加载css及其他媒体资源的选项

questions
=====

1.像下面这些url ,是否需要去重

```http://127.0.0.1:8080/search?q=ersd&entity_type=object&entity_subtype=bookmarks&search_type=entities
http://127.0.0.1:8080/search?q=ersd&entity_type=object&entity_subtype=blog&search_type=entities
http://127.0.0.1:8080/search?q=ersd&entity_type=object&entity_subtype=comment&search_type=entities
http://127.0.0.1:8080/search?q=ersd&entity_type=object&entity_subtype=discussion&search_type=entities
http://127.0.0.1:8080/search?q=ersd&entity_type=object&entity_subtype=file&search_type=entities
http://127.0.0.1:8080/search?q=ersd&entity_type=object&entity_subtype=page&search_type=entities
```

2.http status code **非200** 是否返回

3.是否模拟 **POST** **xhr** **jsonp** 等请求

