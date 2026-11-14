#!/usr/bin/env python3
"""AI HQ controlled implementation: safe, deterministic app feature installation."""
import os, sys, re, json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
p=root/"index.html"
issue=(os.environ.get("ISSUE_TITLE","")+" "+os.environ.get("ISSUE_BODY",""))[:8000]
data=p.read_text(encoding="utf-8")

def add_search(doc):
    if 'id="book-search"' in doc:
        return doc, "検索機能はすでに実装されています", False
    anchors=[
      ('</style>', '.searchbar{max-width:760px;margin:0 auto 10px;padding:0 14px}.searchbar input{display:block;width:100%;padding:13px 15px;border:1px solid #c8b49e;border-radius:12px;font-size:16px;background:#fffaf4;color:#3a2a20}.searchbar input:focus{outline:3px solid #d4ac7a}.searchcount{font-size:12px;color:#816c5c;margin:5px 3px 0}</style>'),
      ('<main><div class="case"', '<main><div class="searchbar"><label for="book-search" class="muted">本を検索</label><input id="book-search" type="search" placeholder="タイトル・著者で検索" aria-label="本を検索" autocomplete="off"><div id="search-count" class="searchcount" aria-live="polite"></div></div><div class="case"'),
      ('検索・保存は未実装です。','保存は未実装です。'),
      ('let filter="read";','let filter="read",query="";'),
      ('const list=books.filter(b=>filter==="favorite"?b.favorite:b.type===filter);','const list=books.filter(b=>(filter==="favorite"?b.favorite:b.type===filter) && (b.title+" "+b.author).toLocaleLowerCase().includes(query));document.getElementById("search-count").textContent=query?list.length+"冊見つかりました":"";'),
      ('document.getElementById("close").onclick=', 'document.getElementById("book-search").addEventListener("input",e=>{query=e.target.value.trim().toLocaleLowerCase();render()});document.getElementById("close").onclick=')
    ]
    for old,new in anchors:
        if doc.count(old)!=1:
            raise ValueError("想定と異なるアプリ構造（置換位置）: "+old[:55])
        doc=doc.replace(old,new,1)
    if 'id="book-search"' not in doc or 'query?list.length' not in doc:
        raise ValueError("検索UIの生成チェックに失敗")
    if doc.count("<script>")!=1 or doc.count("</script>")!=1:
        raise ValueError("スクリプト構造チェックに失敗")
    return doc,"タイトル・著者検索、検索件数、絞り込みを追加",True

def add_export(doc):
    if 'id="export-books"' in doc:
        return doc,"本棚JSON書き出しは実装済みです",False
    old='<main><div class="case"'
    # The initial version only exports sample data, not personal saved books
    insert='<main><div style="max-width:760px;margin:0 auto 14px"><button id="export-books" class="tab" type="button">本棚のサンプルJSONを書き出す</button></div><div class="case"'
    if doc.count(old)!=1:raise ValueError("想定と異なるHTML構造")
    doc=doc.replace(old,insert,1)
    old='document.getElementById("close").onclick='
    replacement='document.getElementById("export-books").onclick=()=>{const blob=new Blob([JSON.stringify(books,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="books-sample.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)};'+old
    if doc.count(old)!=1:raise ValueError("予期しないイベント構造")
    doc=doc.replace(old,replacement,1)
    return doc,"既存サンプル本棚データのJSON書き出し機能を追加",True

if re.search(r"検索|search",issue,re.I):
    updated,message,changed=add_search(data)
elif re.search(r"書き出し|エクスポート|export",issue,re.I):
    updated,message,changed=add_export(data)
else:
    print(json.dumps({"status":"unsupported","message":"自動実装対象外です。対応指示：検索機能を追加／サンプルJSONを書き出す。Codexによる自由開発は未接続。"},ensure_ascii=False))
    sys.exit(12)
if changed:
    p.write_text(updated,encoding="utf-8")
print(json.dumps({"status":"changed" if changed else "already","message":message},ensure_ascii=False))
