'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRouter, useSearchParams } from 'next/navigation';
import { Copy, Trash } from 'lucide-react';
import Image from 'next/image';

interface QueryItem {
  keyword: string;
  description?: string;
  example?: string;
  constraint?: string;
  [key: string]: string | null | undefined;
}

interface Provider {
  name: string;
  prefix: string;
  docs: string;
  kv_separator: string | null;
  query_separator: string | null;
  'operators/and': string | null;
  'operators/or': string | null;
  'operators/not': string | null;
  as_includeprefix: 'TRUE' | 'FALSE';
  png_uri: string;
}

interface CountryMap {
  [key: string]: string;
}

interface FormQuery {
  keyword: string;
  value: string;
  operator?: 'and' | 'or' | 'not';
}

const QueryBuilder = () => {
  const [queries, setQueries] = useState<QueryItem[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [countries, setCountries] = useState<CountryMap>({});
  const [formQueries, setFormQueries] = useState<FormQuery[]>([]);
  const searchParams = useSearchParams();
  const router = useRouter();

  const setDefaultFormQueries = useCallback(() => {
    const defaultQueries: FormQuery[] = [
      { keyword: 'ip', value: '1.1.1.1' },
      { keyword: 'port', value: '53', operator: 'and' },
      { keyword: 'country', value: 'US', operator: 'not' }
    ];
    setFormQueries(defaultQueries);
    const params = new URLSearchParams();
    params.set('queries', JSON.stringify(defaultQueries));
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router]);

  useEffect(() => {
    const loadData = async () => {
      const [queriesRes, providersRes, countriesRes] = await Promise.all([
        fetch('/data/queries.json'),
        fetch('/data/providers.json'),
        fetch('/data/countries.json'),
      ]);
      setQueries(await queriesRes.json());
      setProviders(await providersRes.json());
      setCountries(await countriesRes.json());
    };
    loadData();

    const urlQueries = searchParams.get('queries');
    if (urlQueries) {
      try {
        setFormQueries(JSON.parse(urlQueries));
      } catch (error) {
        console.error('invalid URL query:', error);
        setDefaultFormQueries();
      }
    } else {
      setDefaultFormQueries();
    }
  }, [searchParams, setDefaultFormQueries]);

  const addQueryInput = () => {
    const newQueries: FormQuery[] = [...formQueries, { keyword: 'ip', value: '', operator: 'and' as 'and' }];
    setFormQueries(newQueries);
    updateUrlParams(newQueries);
  };

  const removeQueryInput = (index: number) => {
    const newFormQueries = formQueries.filter((_, i) => i !== index);
    const updatedQueries = newFormQueries.length ? newFormQueries : [{ keyword: 'ip', value: '' }];
    setFormQueries(updatedQueries);
    updateUrlParams(updatedQueries);
  };

  const resetForm = () => {
    const newQueries = [{ keyword: 'ip', value: '' }];
    setFormQueries(newQueries);
    updateUrlParams(newQueries);
  };

  const updateFormQuery = (index: number, field: 'keyword' | 'value' | 'operator', val: string) => {
    const newFormQueries = [...formQueries];
    if (field === 'keyword' || field === 'value') {
      newFormQueries[index][field] = val;
    } else {
      newFormQueries[index].operator = val as 'and' | 'or' | 'not';
    }
    setFormQueries(newFormQueries);
    updateUrlParams(newFormQueries);
  };

  const updateUrlParams = (queries: FormQuery[] = formQueries) => {
    const params = new URLSearchParams();
    const filteredQueries = queries.filter(q => q.value.trim());
    if (filteredQueries.length > 0) {
      params.set('queries', JSON.stringify(filteredQueries));
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const buildQueries = () => {
    return providers.map(provider => {
      const unsupported: string[] = [];
      let valid = true;

      // Collect used operators
      const usedOps = new Set<string>();
      formQueries.forEach((q, i) => {
        if (i > 0 && q.operator) usedOps.add(q.operator);
      });

      for (const op of usedOps) {
        const operatorKey = `operators/${op}` as keyof Provider; 
        if (provider[operatorKey] === null) {
          unsupported.push(`Operator ${op.toUpperCase()}`);
          valid = false;
        }
      }
      for (const { keyword, value } of formQueries) {
        const matchingQuery = queries.find(q => q.keyword === keyword);
        if (!matchingQuery || !matchingQuery[provider.name]) {
          unsupported.push(keyword);
          valid = false;
        }
        if (value.trim()) {
          if (matchingQuery?.constraint && !new RegExp(matchingQuery.constraint).test(value)) {
            unsupported.push(`${keyword} (invalid value: ${value})`);
            valid = false;
          }
          if (provider.name === 'quake360' && keyword === 'country' && !countries[value.toUpperCase()]) {
            unsupported.push(`${keyword} (invalid code: ${value})`);
            valid = false;
          }
        }
      }

      if (!valid) {
        return {
          provider,
          queryText: '',
          unavailable: true,
          tooltip: `unsupported for ${provider.name}: ${unsupported.join(', ')}`,
        };
      }
      let queryText = '';
      formQueries.forEach(({ keyword, value, operator }, i) => {
        if (!value.trim()) return;
        const matchingQuery = queries.find(q => q.keyword === keyword)!;
        let formattedValue = value;
        if (keyword === 'asn' && provider.as_includeprefix === 'TRUE') {
          formattedValue = `AS${value}`;
        }
        if (provider.name === 'quake360' && keyword === 'country') {
          formattedValue = countries[value.toUpperCase()]!;
        }
        const isFreeform = matchingQuery[provider.name] === 'freeform';
        let term = isFreeform
          ? `"${formattedValue}"`
          : `${matchingQuery[provider.name]}${provider.kv_separator}"${formattedValue}"`;
        if (i > 0) {
          if (operator && operator !== 'not' && provider[`operators/${operator}`]) {
            queryText += ` ${provider[`operators/${operator}`]} `;
          } else {
            queryText += provider.query_separator || ' ';
          }
        }
        if (operator === 'not' && provider['operators/not']) {
          // Special handling for providers like criminalip
          if (provider.name.includes('criminalip')) {
            term = provider['operators/not'] + term.replace(/"/g, '');
          } else {
            term = `${provider['operators/not']} ${term}`;
          }
        }

        queryText += term;
      });

      return { provider, queryText: queryText.trim(), unavailable: false, tooltip: '' };
    }).filter(q => q.queryText || q.unavailable);
  };

  const generatedQueries = buildQueries();

  return (
    <TooltipProvider>
      <div className="max-w-3xl mx-auto mb-8">
        {formQueries.map((q, index) => {
          const matchingQuery = queries.find(item => item.keyword === q.keyword);
          return (
            <div key={index} className="flex items-center mb-4 space-x-2">
              {index > 0 && (
                <Select
                  value={q.operator || 'and'}
                  onValueChange={val => updateFormQuery(index, 'operator', val)}
                >
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="and">AND</SelectItem>
                    <SelectItem value="or">OR</SelectItem>
                    <SelectItem value="not">NOT</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Select
                value={q.keyword}
                onValueChange={val => updateFormQuery(index, 'keyword', val)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="select keyword" />
                </SelectTrigger>
                <SelectContent>
                  {queries.map(item => (
                    <SelectItem key={item.keyword} value={item.keyword}>
                      {item.keyword}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {q.keyword === 'country' ? (
                <Select
                  value={q.value}
                  onValueChange={val => updateFormQuery(index, 'value', val)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(countries).map(([code, name]) => (
                      <SelectItem key={code} value={code}>
                        {name} ({code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={q.value}
                  onChange={e => updateFormQuery(index, 'value', e.target.value)}
                  placeholder={matchingQuery?.example || 'enter value'}
                  className="flex-1"
                />
              )}
              <Button variant="ghost" onClick={() => removeQueryInput(index)} size="icon">
                <Trash className="h-4 w-4" />
              </Button>
              {matchingQuery?.description && (
                <span className="text-sm text-gray-500 italic ml-2">{matchingQuery.description}</span>
              )}
            </div>
          );
        })}
        <div className="flex space-x-2">
          <Button onClick={addQueryInput}>add element</Button>
          <Button variant="outline" onClick={resetForm}>clear all</Button>
        </div>
      </div>

      <div className="flex flex-col space-y-2 max-w-4xl mx-auto">
        {generatedQueries.map(({ provider, queryText, unavailable, tooltip }) => (
          <Card key={provider.name} className={`p-2 ${unavailable ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 min-w-[150px]">
                <a href={provider.docs} target="_blank" rel="noopener noreferrer">
                  <Image src={provider.png_uri} alt={`${provider.name} logo`} width={24} height={24} className="w-6 h-6" />
                </a>
                <CardTitle className="text-sm font-medium">{provider.name}</CardTitle>
              </div>
              <div className="flex-1 mx-4">
                {unavailable ? (
                  <p className="font-mono text-xs bg-gray-200 text-red-600 px-2 py-1 rounded overflow-x-auto whitespace-nowrap">
                    {tooltip}
                  </p>
                ) : (
                  <p className="font-mono text-xs bg-black text-cyan-400 px-2 py-1 rounded overflow-x-auto whitespace-nowrap">
                    {queryText}
                  </p>
                )}
              </div>
              {!unavailable && (
                <div className="flex items-center space-x-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          if (navigator.clipboard) {
                            navigator.clipboard.writeText(queryText).catch(err => {
                              console.error('failed to copy: ', err);
                              alert('copy to clipboard failed.');
                            });
                          } else {
                            alert('clipboard API unavailable.');
                          }
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy to clipboard</TooltipContent>
                  </Tooltip>
                  <Button
                    size="sm"
                    className="text-xs h-6"
                    onClick={() => {
                      const encoded = provider.name === 'fofa' ? btoa(queryText) : encodeURIComponent(queryText);
                      window.open(`${provider.prefix}${encoded}`, '_blank');
                    }}
                  >
                    Open
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </TooltipProvider>
  );
};

export default QueryBuilder;