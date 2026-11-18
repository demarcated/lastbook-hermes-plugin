import json, sys
sys.path.insert(0, '/opt/hermes')
from hermes_cli.plugin_validate_desktop import desktop_surface_findings
print(json.dumps(desktop_surface_findings(open(sys.argv[1], encoding='utf-8').read())))
