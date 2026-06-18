import json, sys

path = '/home/shake/.claude/projects/-data-apps-besmart/7541ebe5-4033-4f85-b97c-2b3a67607a80.jsonl'
lines = open(path).readlines()
print(f'Total lines: {len(lines)}')

# Print structure of first line
obj = json.loads(lines[0])
print(f'Top-level keys: {list(obj.keys())}')
if 'message' in obj:
    msg = obj['message']
    print(f'Message keys: {list(msg.keys())}')
    print(f'Role: {msg.get("role")}')
    c = msg.get('content', '')
    if isinstance(c, list):
        for item in c[:2]:
            print(f'  Content item: {str(item)[:300]}')
    elif isinstance(c, str):
        print(f'  Content str: {c[:300]}')
