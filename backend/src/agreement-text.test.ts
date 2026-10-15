import {describe,expect,it} from 'vitest';
import {agreementSentence} from './agreement-text';

describe('APT free-text presentation',()=>{
  it.each([
    ['private driveway at the front of the property','Private driveway at the front of the property.'],
    ['  none  ','None.'],
    ['Joshua, Isabelle and Holly','Joshua, Isabelle and Holly.'],
    ['Shared access via McDonald Road.','Shared access via McDonald Road.'],
    ['“private space.”','“Private space.”'],
    ['Is parking allocated?','Is parking allocated?'],
    ['2 spaces beside the garage','2 Spaces beside the garage.'],
    ['', 'None.'],
  ])('formats %s once',(input,expected)=>{
    expect(agreementSentence(input)).toBe(expected);
    expect(agreementSentence(agreementSentence(input))).toBe(expected);
  });
});
