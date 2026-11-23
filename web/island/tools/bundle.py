"""src/*.js(ES 모듈)를 하나로 이어 붙여 index.html 안에 넣은 한 파일을 만든다(도구 설치 없이 파이썬만).

  python3 tools/bundle.py 갈매미맨마을.html              # 더블클릭으로 여는 한 파일(모델은 못 읽어 캡슐로 나옴)
  python3 tools/bundle.py page.html --artifact            # claude.ai 아티팩트용: <!doctype>/<head> 없이 내용만
  python3 tools/bundle.py index.html --flat               # 모델이 같은 폴더의 models/, assets/에 있는 곳(서버 village3d 등)에 올릴 때

규칙: 상대 경로 import만 합치고 "three" / "three/addons/..." import는 맨 위에 한 번씩 남긴다.
여러 파일에 같은 최상위 이름이 있으면 멈춘다(합치면 충돌하므로).
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMPORT = re.compile(r'^import\s+(.+?)\s+from\s+"([^"]+)";\s*$', re.M)
DECL = re.compile(r'^(?:export\s+)?(?:async\s+)?(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)', re.M)


def top_names(src):
    """최상위 const/let/function/class 이름. 한 줄에 여러 개(const a = 1, b = 2)도 찾는다."""
    names = []
    for line in src.splitlines():
        m = re.match(r'(?:export\s+)?(?:async\s+)?(function|class)\s+([A-Za-z_$][\w$]*)', line)
        if m:
            names.append(m.group(2)); continue
        if not re.match(r'(?:export\s+)?(?:const|let)\s', line):
            continue
        flat = line.split("//")[0]
        for _ in range(6):                                  # 괄호 안(함수 인자·배열·객체)은 지움
            flat = re.sub(r'\([^()]*\)|\[[^\[\]]*\]|\{[^{}]*\}|"[^"]*"|`[^`]*`', "0", flat)
        names += re.findall(r'(?:const|let|,)\s*([A-Za-z_$][\w$]*)\s*=(?!=)', flat)
    return names


def export_names(src):
    """export가 붙은 최상위 이름들."""
    return top_names("\n".join(l[len("export "):] for l in src.splitlines() if l.startswith("export ")))


def bundle():
    order, seen = [], set()

    def visit(path):
        path = os.path.normpath(path)
        if path in seen:
            return
        seen.add(path)
        for m in IMPORT.finditer(open(path, encoding="utf8").read()):
            if m.group(2).startswith("."):
                visit(os.path.join(os.path.dirname(path), m.group(2)))
        order.append(path)

    visit(os.path.join(ROOT, "src", "main.js"))
    externals, parts, names, namespaces = [], [], {}, {}
    for p in order:
        src = open(p, encoding="utf8").read()
        for n in top_names(src) + [b for _, b in re.findall(r"import\s*\{[^}]*?([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)", src)]:
            if n in names:
                sys.exit(f"이름 충돌: {n} ({names[n]}, {p})")
            names[n] = p

        def drop(m):
            if not m.group(2).startswith("."):
                line = m.group(0).strip()
                if line not in externals:
                    externals.append(line)
                return ""
            # import * as NS → 그 파일이 내보내는 이름들을 모은 객체
            ns = re.match(r"\*\s+as\s+([A-Za-z_$][\w$]*)$", m.group(1).strip())
            if ns:
                target, name = os.path.normpath(os.path.join(os.path.dirname(p), m.group(2))), ns.group(1)
                if name in namespaces:                     # 같은 파일을 같은 이름으로 또 가져오면 한 번만 만듦
                    if namespaces[name] != target:
                        sys.exit(f"이름 충돌: import * as {name} ({namespaces[name]}, {target})")
                    return ""
                if name in names:
                    sys.exit(f"이름 충돌: {name} ({names[name]}, import * in {p})")
                namespaces[name] = target; names[name] = p
                return f"const {name} = Object.freeze({{ {', '.join(export_names(open(target, encoding='utf8').read()))} }});\n"
            # 상대 import의 별칭(import { A as B })은 같은 값을 가리키는 const로 바꿈
            aliases = re.findall(r"([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)", m.group(1))
            return "".join(f"const {b} = {a};\n" for a, b in aliases)

        src = IMPORT.sub(drop, src)
        src = re.sub(r'^export\s+(?=(?:async\s+)?(?:function|class|const|let)\b)', "", src, flags=re.M)
        if re.search(r'^\s*(import|export)\s', src, re.M):
            sys.exit(f"합칠 수 없는 import/export가 남음: {p}")
        parts.append(f"// ===== {os.path.relpath(p, ROOT)} =====\n{src.strip()}\n")
    return "\n".join(externals) + "\n\n" + "\n".join(parts), len(order)


def main():
    out = sys.argv[1]
    artifact = "--artifact" in sys.argv
    code, n = bundle()
    if "--flat" in sys.argv or artifact:   # ../village/ 경로를 찾지 않고 같은 폴더의 models/, assets/만 씀
        code = code.replace('["../village/models/", "models/"]', '["models/"]').replace('"../village/assets/', '"assets/')
    html = open(os.path.join(ROOT, "index.html"), encoding="utf8").read()
    tag = '<script type="module" src="src/main.js"></script>'
    assert html.count(tag) == 1
    html = html.replace(tag, '<script type="module">\n' + code.replace("</script", "<\\/script") + "</script>")
    if artifact:   # 아티팩트는 게시할 때 문서 뼈대를 씌우므로 <title>·<style>·본문만 남긴다
        title = re.search(r"<title>.*?</title>", html, re.S).group(0)
        style = re.search(r"<style>.*?</style>", html, re.S).group(0)
        body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
        html = f"{title}\n{style}\n{body.strip()}\n"
    open(out, "w", encoding="utf8").write(html)
    print(f"모듈 {n}개 → {out} ({len(html.encode('utf8')):,} bytes)")


if __name__ == "__main__":
    main()
