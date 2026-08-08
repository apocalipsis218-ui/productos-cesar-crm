import assert from 'node:assert/strict';
import fs from 'node:fs';

const main=fs.readFileSync(
  new URL('../src/main.js',import.meta.url),
  'utf8'
);
const sql=fs.readFileSync(
  new URL(
    '../supabase/sql/53_actualizacion_v940_r2_validacion_areas_carniceria.sql',
    import.meta.url
  ),
  'utf8'
);
const installer=fs.readFileSync(
  new URL('../APLICAR_V940_R2.ps1',import.meta.url),
  'utf8'
);
const pkg=JSON.parse(
  fs.readFileSync(new URL('../package.json',import.meta.url),'utf8')
);

const checks=[
  [
    'R2 identificada en la interfaz',
    main.includes(
      'V9.4.0 R2 · Validación centralizada del área operativa del despachador'
    )
  ],
  [
    'función central consulta directamente al empleado',
    /function public\.empleado_habilitado_area_v940r2/.test(sql) &&
    /from public\.empleados_operativos e/.test(sql) &&
    /e\.id=p_empleado_id/.test(sql) &&
    /coalesce\(e\.activo,true\)/.test(sql)
  ],
  [
    'normaliza área principal con espacios y acentos',
    /lower\(unaccent\(btrim\(coalesce\(e\.area,''\)\)\)\)/.test(sql) &&
    /lower\(unaccent\(btrim\(coalesce\(p_area,''\)\)\)\)/.test(sql)
  ],
  [
    'normaliza también las áreas adicionales',
    /unnest\([\s\S]*coalesce\(e\.areas_adicionales,'\{\}'::text\[\]\)/.test(sql) &&
    /lower\(unaccent\(btrim\(coalesce\(a,''\)\)\)\)/.test(sql)
  ],
  [
    'trigger y RPC usan la misma autorización',
    (sql.match(/empleado_habilitado_area_v940r2/g)||[]).length>=7 &&
    /function public\.pc_validar_identidad_preparacion_v9397[\s\S]*empleado_habilitado_area_v940r2/.test(sql) &&
    /function public\.tomar_orden_v9397[\s\S]*empleado_habilitado_area_v940r2/.test(sql)
  ],
  [
    'elimina la comparación divergente desde rowtype',
    !/lower\(unaccent\(coalesce\(v_empleado\.area,''\)\)\)<>'carniceria'/.test(sql)
  ],
  [
    'preserva bloqueo de empleados inactivos y ajenos al área',
    /El empleado seleccionado no está habilitado para Carnicería\./.test(sql) &&
    /El empleado seleccionado no existe o está inactivo\./.test(sql)
  ],
  [
    'preserva programación futura, identidad y límite de cola',
    /La orden está programada para %\. Podrá tomarse cuando llegue esa fecha\./.test(sql) &&
    /tomado_por_user:=v_uid/.test(sql) &&
    /v_cola>=3/.test(sql)
  ],
  [
    'permisos de la función limitados a usuarios autenticados',
    /revoke all on function public\.empleado_habilitado_area_v940r2[\s\S]*from public,anon/.test(sql) &&
    /grant execute on function public\.empleado_habilitado_area_v940r2[\s\S]*to authenticated/.test(sql)
  ],
  [
    'mensaje de interfaz deja de culpar al SQL 52',
    !/verifica que aplicaste el SQL 52 de la V9\.4\.[0-9]+ R1/.test(main) &&
    /área principal y sus áreas adicionales/.test(main)
  ],
  [
    'migración no modifica ni elimina órdenes existentes',
    !/\b(update|delete from|truncate table)\s+public\.ordenes\b/i.test(sql)
  ],
  [
    'controles finales identifican versión R2',
    /validacion_area_centralizada/.test(sql) &&
    /funcion_area_activa/.test(sql) &&
    /'9\.4\.[0-9]+ R2' as version/.test(sql)
  ],
  [
    'instalador exige SQL 53 y auditoría R2',
    /53_actualizacion_v940_r2_validacion_areas_carniceria\.sql/.test(installer) &&
    /auditoria_validacion_areas_v940_r2\.mjs/.test(installer)
  ],
  [
    'auditoría integrada en pretest',
    pkg.scripts.pretest.includes('auditoria_validacion_areas_v940_r2.mjs')
  ]
];

for(const [name,ok] of checks){
  assert.equal(Boolean(ok),true,`FALLO: ${name}`);
  console.log(`OK - ${name}`);
}

const normalizeArea=value=>String(value||'')
  .trim()
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu,'')
  .toLowerCase();

const enabled=(employee,area)=>{
  const target=normalizeArea(area);
  return Boolean(
    employee?.activo &&
    (
      normalizeArea(employee.area)===target ||
      (employee.areas_adicionales||[])
        .some(item=>normalizeArea(item)===target)
    )
  );
};

const dariel={
  id:5,
  nombre:'Dariel Martinez',
  activo:true,
  area:'Carnicería',
  areas_adicionales:[]
};

assert.equal(
  enabled(dariel,'Carnicería'),
  true,
  'Dariel debe quedar habilitado por su área principal.'
);
assert.equal(
  enabled(
    {...dariel,area:'Delivery',areas_adicionales:[' Carnicería ']},
    'Carnicería'
  ),
  true,
  'El área adicional debe aceptar espacios y acentos.'
);
assert.equal(
  enabled({...dariel,activo:false},'Carnicería'),
  false,
  'Un empleado inactivo debe continuar bloqueado.'
);
assert.equal(
  enabled({...dariel,area:'Delivery'},'Carnicería'),
  false,
  'Un empleado sin Carnicería debe continuar bloqueado.'
);

console.log(
  'Auditoría de validación de áreas V9.4.0 R2 aprobada.'
);
