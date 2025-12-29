#!/usr/bin/env python3
"""
RSS 新闻抓取脚本
功能: 从多个 RSS 源抓取新闻，使用 AI 优化摘要，上传到 Cloudflare Worker
"""

import os
import sys
import time
import re
import feedparser
import requests

# ============================================
# 配置区域
# ============================================

# Worker API 地址 (从环境变量读取)
API_URL = os.getenv("NEWS_API_URL") or os.getenv("API_URL", "https://news-api.zhusen-wang.workers.dev/add")

# API 密钥 (从环境变量读取)
API_KEY = os.getenv("NEWS_API_KEY") or os.getenv("API_KEY", "56299bfa63f7cacc3d3b59a6084ccd095d7d5858c3216c5b109618c2f07b5da2")

# Groq API Key (从环境变量读取)
# 获取方式: https://console.groq.com/keys
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# 是否启用 AI 摘要 (设为 "true" 或 "1" 启用，其他值禁用)
ENABLE_AI_SUMMARY = os.getenv("ENABLE_AI_SUMMARY", "true").lower() in ("true", "1")

# RSS 源列表 (可以随意添加)
SOURCES = [
    {
        "name": "Hacker News",
        "url": "https://news.ycombinator.com/rss"
    },
    {
        "name": "V2EX",
        "url": "https://www.v2ex.com/index.xml"
    },
    {
        "name": "36氪",
        "url": "https://36kr.com/feed"
    },
    {
        "name": "少数派",
        "url": "https://sspai.com/feed"
    },
    {
        "name": "TechCrunch",
        "url": "https://techcrunch.com/feed/"
    },
    {
        "name": "The Verge",
        "url": "https://www.theverge.com/rss/index.xml"
    },
]

# 请求超时时间 (秒)
REQUEST_TIMEOUT = 30

# ============================================
# AI 摘要功能
# ============================================

def summarize_with_ai(title: str, raw_summary: str) -> str:
    """
    使用 Groq API (Llama 3) 优化新闻摘要

    Args:
        title: 新闻标题
        raw_summary: 原始摘要

    Returns:
        AI 优化后的摘要，失败时返回原始摘要
    """
    if not GROQ_API_KEY:
        return raw_summary

    try:
        from groq import Groq

        client = Groq(api_key=GROQ_API_KEY)

        # 清理原始摘要，去除 HTML 标签和过长内容
        clean_summary = raw_summary
        if "<" in clean_summary:
            clean_summary = re.sub(r'<[^>]+>', '', clean_summary)
        clean_summary = clean_summary.strip()[:1000]  # 限制输入长度

        # 构建提示词
        prompt = f"""你是一个科技新闻编辑。请阅读以下新闻标题和原始摘要，用**中文**写一段简短的总结（不超过 100 字）。
去除非核心信息，直击要点。如果原始内容已经是中文，则优化其表达。

标题：{title}

摘要：{clean_summary}

请直接输出优化后的摘要，不要加任何前缀或解释。"""

        response = client.chat.completions.create(
            model="llama-3.3-8b-instant",  # 或 "llama3-8b-8192"
            messages=[
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=200,
        )

        ai_summary = response.choices[0].message.content.strip()

        # 如果 AI 返回为空，使用原始摘要
        if ai_summary:
            return ai_summary
        return raw_summary

    except ImportError:
        print("   ⚠️  groq 库未安装，使用原始摘要")
        return raw_summary
    except Exception as e:
        print(f"   ⚠️  AI 摘要失败: {e}，使用原始摘要")
        return raw_summary


# ============================================
# 以下代码无需修改
# ============================================


def clean_html(text: str) -> str:
    """清理 HTML 标签"""
    if not text:
        return ""
    text = re.sub(r'<[^>]+>', '', text)
    return text.strip()


def fetch_rss(source: dict) -> list:
    """
    抓取单个 RSS 源

    Args:
        source: 包含 name 和 url 的字典

    Returns:
        文章列表
    """
    name = source["name"]
    url = source["url"]

    print(f"📡 正在抓取: {name} ({url})...")

    try:
        # 获取 RSS Feed
        response = requests.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        response.raise_for_status()

        # 解析 RSS
        feed = feedparser.parse(response.content)

        articles = []
        for entry in feed.entries:
            # 提取标题
            title = entry.get("title", "")

            # 提取链接
            link = entry.get("link", "")

            # 提取摘要 (优先用 description，其次用 summary)
            raw_summary = entry.get("description", "") or entry.get("summary", "")

            # 清理 HTML 标签
            summary = clean_html(raw_summary)[:500]

            # 使用链接作为唯一标识符
            external_id = link

            if title and link:
                articles.append({
                    "title": title,
                    "url": link,
                    "source": name,
                    "summary": summary,
                    "raw_summary": raw_summary,  # 保存原始摘要供 AI 处理
                    "external_id": external_id
                })

        print(f"   ✅ 成功获取 {len(articles)} 条")
        return articles

    except requests.exceptions.Timeout:
        print(f"   ⏱️  超时: {url}")
        return []

    except requests.exceptions.RequestException as e:
        print(f"   ❌ 网络错误: {e}")
        return []

    except Exception as e:
        print(f"   ⚠️  解析错误: {e}")
        return []


def process_articles_with_ai(articles: list) -> list:
    """
    使用 AI 优化文章摘要

    Args:
        articles: 文章列表

    Returns:
        处理后的文章列表
    """
    if not ENABLE_AI_SUMMARY:
        print("📝 AI 摘已禁用，使用原始摘要")
        return articles

    if not GROQ_API_KEY:
        print("⚠️  未设置 GROQ_API_KEY，使用原始摘要")
        return articles

    print(f"🤖 正在使用 AI 优化 {len(articles)} 条摘要...")

    for i, article in enumerate(articles, 1):
        title = article["title"]
        raw_summary = article.get("raw_summary") or article["summary"]

        print(f"   [{i}/{len(articles)}] 处理: {title[:30]}...", end=" ")

        # 调用 AI 优化摘要
        ai_summary = summarize_with_ai(title, raw_summary)

        article["summary"] = ai_summary
        print("✓")

        # 避免触发速率限制
        if i < len(articles):
            time.sleep(1)

    return articles


def upload_articles(articles: list) -> bool:
    """
    将文章上传到 Worker

    Args:
        articles: 文章列表

    Returns:
        是否成功
    """
    if not articles:
        return True

    print(f"📤 正在上传 {len(articles)} 条文章到 API...")

    try:
        response = requests.post(
            API_URL,
            headers={
                "x-api-key": API_KEY,
                "Content-Type": "application/json"
            },
            json=articles,
            timeout=60
        )

        response.raise_for_status()
        result = response.json()

        print(f"   ✅ 上传成功: 新增 {result.get('inserted', 0)} 条, 跳过 {result.get('skipped', 0)} 条")
        return True

    except requests.exceptions.HTTPError as e:
        print(f"   ❌ HTTP 错误: {e}")
        if response.status_code == 401:
            print(f"   ⚠️  API 密钥错误，请检查 API_KEY 配置")
        return False

    except requests.exceptions.RequestException as e:
        print(f"   ❌ 网络错误: {e}")
        return False


def main():
    """主函数"""
    print("=" * 50)
    print("   RSS 新闻抓取脚本 (AI 增强版)")
    print("=" * 50)
    print()

    # 检查配置
    if not API_URL or "YOUR_WORKER_URL" in API_URL:
        print("❌ 错误: 请先配置 API_URL")
        sys.exit(1)

    if not API_KEY or "YOUR_API_KEY" in API_KEY:
        print("❌ 错误: 请先配置 API_KEY")
        sys.exit(1)

    # 显示 AI 状态
    if ENABLE_AI_SUMMARY and GROQ_API_KEY:
        print(f"🤖 AI 摘要: 已启用")
    else:
        print(f"📝 AI 摘要: 已禁用")

    print(f"API 地址: {API_URL}")
    print(f"RSS 源数量: {len(SOURCES)}")
    print()

    # 收集所有文章
    all_articles = []

    for i, source in enumerate(SOURCES, 1):
        print(f"[{i}/{len(SOURCES)}] ", end="")

        articles = fetch_rss(source)
        all_articles.extend(articles)

        # 避免请求过快
        if i < len(SOURCES):
            time.sleep(1)

    print()
    print(f"📊 总共抓取: {len(all_articles)} 条文章")
    print()

    # AI 处理摘要
    if all_articles:
        all_articles = process_articles_with_ai(all_articles)
        print()

    # 上传文章
    if all_articles:
        success = upload_articles(all_articles)
        if success:
            print()
            print("🎉 全部完成!")
        else:
            print()
            print("⚠️  上传失败，请检查网络和配置")
            sys.exit(1)
    else:
        print("⚠️  没有抓取到任何文章")


if __name__ == "__main__":
    main()
