/* js/lz-logo.js: logo Lazismu Bantul (SVG) di pojok kiri atas bilah menu semua halaman.
 *
 * Permintaan pemilik (5 Oktober 2026): di setiap menu dan modul, bilah kiri atas menampilkan logo lembaga berupa SVG.
 * Logonya BERGERAK hanya saat pertama kali masuk ke menu itu, sesudahnya diam. Bentuk dan urutan geraknya diambil
 * dari berkas contoh pemilik (lazismu-logo-embed.html): garis tiap bagian digambar bergiliran, isi warna masuk
 * sementara garisnya menipis, cahaya menyala (hanya tema gelap), dan seluruh logo membesar sangat pelan.
 *
 * "Menu" dibaca dari butir bilah yang aktif (.tn-item.active, id nav_<kode>). Semua halaman modul memakai pola itu,
 * jadi berkas ini tidak perlu tahu cara tiap halaman berpindah menu: pengamat pada bilah menangkap perubahannya.
 * Kunci yang sudah pernah diputar disimpan di sessionStorage (lz_logo_dilihat): menutup tab atau peramban memulai
 * dari awal lagi, membuka menu yang sama di sesi yang sama tidak memutarnya lagi.
 *
 * Logo baru diputar saat benar-benar terlihat (IntersectionObserver). Di halaman utama bilahnya tersembunyi selama
 * layar masuk; tanpa pengecekan ini animasi menu pertama habis diputar di balik layar masuk dan tercatat "sudah".
 *
 * Ukuran garis dan cahaya dihitung dari lebar logo di layar. Di contoh pemilik logonya 640 sampai 900 px dan garisnya
 * 10 satuan viewBox (sekitar 2 px); di bilah menu logonya sekitar 70 px, dan 10 satuan tinggal 0,2 px: tahap
 * "garis digambar" jadi tidak terlihat sama sekali, yang tampak cuma isi warna yang muncul. */
(function () {
  'use strict';
  if (window.LZLogo) return;

  var NS = 'http://www.w3.org/2000/svg';
  var VB_L = 3840, VB_T = 2574;
  /* [warna, d]: o = oranye, w = tulisan (mengikuti warna teks tema). Urutannya urutan gambar: kelopak, "lazismu",
     "bantul". */
  var BAGIAN = [
    ['o', 'M3103 0L3092 10L3075 36L3053 81L3032 137L3018 188L3010 231L3007 259L3006 302L3007 303L3007 323L3008 324L3009 347L3015 385L3024 418L3036 446L3049 466L3066 483L3084 493L3099 496L3109 496L3124 493L3133 489L3146 480L3156 470L3166 457L3179 432L3189 403L3197 365L3201 328L3201 311L3202 310L3202 272L3201 271L3201 255L3199 236L3193 200L3185 166L3168 112L3153 75L3133 35L3114 7L3106 0Z'],
    ['o', 'M3534 306L3519 305L3483 313L3433 331L3378 357L3340 379L3300 407L3275 428L3243 460L3220 487L3194 524L3177 557L3170 577L3166 596L3167 627L3171 639L3176 648L3190 663L3198 668L3388 590L3417 562L3444 528L3461 503L3486 460L3504 423L3518 389L3532 345L3536 325L3536 309Z'],
    ['o', 'M3187 659L3190 663L3196 667L3214 674L3219 675L3246 675L3253 673L3256 674L3236 690L3226 702L3221 711L3216 729L3216 744L3219 755L3410 834L3448 834L3485 830L3527 822L3571 810L3616 794L3644 782L3672 768L3699 751L3709 742L3712 737L3709 731L3696 720L3677 708L3650 694L3600 673L3564 661L3527 651L3479 642L3450 639L3391 639L3338 645L3319 650L3314 649L3337 634L3378 601L3407 572L3402 570L3368 583Z'],
    ['o', 'M3217 740L3216 744L3218 754L3226 771L3239 786L3254 797L3255 799L3254 800L3241 797L3220 797L3206 800L3192 807L3182 815L3172 828L3167 840L3164 855L3165 866L3209 972L3215 981L3243 1014L3282 1052L3324 1084L3356 1104L3414 1134L3467 1155L3494 1163L3513 1167L3533 1166L3535 1161L3535 1154L3532 1135L3525 1109L3515 1080L3498 1040L3482 1008L3454 961L3422 918L3392 886L3355 853L3312 823L3315 822L3333 827L3359 831L3391 833L3392 834L3434 834L3433 830L3429 827Z'],
    ['o', 'M3169 843L3166 844L3164 855L3164 871L3166 880L3165 886L3156 874L3140 859L3123 850L3109 847L3091 848L3081 851L3071 856L3060 864L3052 872L3045 882L3041 885L3040 884L3043 868L3043 853L3041 844L3038 844L3032 855L2978 986L2978 990L2980 993L3001 967L3016 944L3017 949L3012 967L3007 1006L3005 1063L3006 1064L3006 1084L3009 1112L3018 1160L3028 1197L3038 1227L3058 1276L3079 1316L3090 1332L3102 1343L3110 1339L3119 1328L3135 1302L3148 1276L3173 1213L3183 1180L3191 1147L3197 1114L3200 1088L3201 1034L3200 1033L3198 993L3194 966L3189 947L3190 944L3202 963L3229 998L3232 995L3231 988L3173 848Z'],
    ['o', 'M2991 740L2791 822L2780 828L2779 832L2814 832L2815 831L2850 829L2884 823L2893 820L2895 821L2894 823L2874 835L2854 850L2828 872L2787 914L2765 942L2746 970L2725 1006L2707 1042L2690 1083L2680 1113L2673 1142L2672 1160L2675 1165L2688 1166L2706 1163L2752 1149L2798 1130L2832 1113L2865 1094L2899 1071L2930 1046L2967 1009L3001 967L3043 866L3043 853L3040 839L3034 825L3029 818L3016 806L3007 801L2991 796L2961 796L2955 798L2953 797L2967 786L2981 771L2991 750L2992 746Z'],
    ['o', 'M3022 660L3009 653L2811 572L2806 574L2837 604L2875 634L2895 647L2890 648L2864 642L2819 637L2758 637L2729 640L2685 648L2657 655L2619 667L2560 691L2538 702L2512 718L2497 732L2497 736L2507 747L2539 767L2588 790L2632 806L2682 820L2730 829L2761 831L2762 832L2803 832L2989 755L2992 746L2992 723L2986 706L2978 694L2954 672L2955 671L2968 674L2994 673L3007 669Z'],
    ['o', 'M2677 304L2674 307L2674 323L2679 347L2693 390L2709 428L2727 464L2746 497L2767 528L2796 564L2825 592L3009 668L3021 661L3035 645L3040 635L3043 625L3044 596L3038 569L3030 549L3013 518L2988 483L2958 449L2930 422L2900 398L2869 377L2833 356L2799 339L2756 321L2726 311L2696 304Z'],
    ['w', 'M0 1117L0 1897L6 1936L16 1967L31 1996L45 2015L66 2036L89 2052L107 2061L136 2071L162 2076L181 2078L219 2078L221 2077L256 1938L256 1934L211 1928L197 1924L179 1914L170 1905L164 1895L160 1882L160 1861L159 1860L159 1118L158 1117Z'],
    ['w', 'M360 1474L398 1600L419 1592L458 1580L514 1567L563 1560L582 1560L583 1559L622 1560L656 1565L668 1569L686 1579L696 1589L703 1600L707 1611L710 1628L710 1659L709 1660L695 1660L694 1659L598 1660L560 1664L525 1670L496 1677L450 1693L418 1709L389 1729L366 1751L348 1775L333 1805L324 1838L321 1866L322 1902L326 1927L330 1942L337 1961L345 1977L365 2005L380 2020L399 2035L415 2045L444 2059L473 2069L500 2076L526 2081L558 2085L586 2086L587 2087L659 2087L720 2081L757 2075L796 2066L834 2054L861 2042L861 1630L860 1629L860 1615L855 1582L846 1549L830 1516L813 1493L792 1473L776 1462L756 1451L739 1444L714 1436L691 1431L664 1427L639 1426L638 1425L565 1426L535 1429L497 1435L430 1450L409 1456ZM710 1791L710 1948L708 1950L682 1957L641 1962L598 1962L574 1959L553 1954L526 1943L511 1933L496 1918L491 1911L485 1898L482 1887L481 1872L484 1853L491 1838L497 1830L511 1817L520 1811L536 1803L552 1797L582 1790L604 1787L650 1785L651 1786L689 1787L708 1789Z'],
    ['w', 'M961 1437L960 1438L960 1570L1236 1570L1240 1572L960 1946L960 2075L1439 2076L1439 1940L1208 1940L1207 1939L1139 1939L1138 1938L1439 1560L1439 1437Z'],
    ['w', 'M1605 1191L1593 1193L1581 1197L1569 1203L1555 1213L1541 1228L1529 1249L1523 1270L1523 1296L1525 1306L1532 1324L1542 1339L1554 1351L1566 1359L1584 1367L1606 1371L1622 1371L1636 1369L1656 1362L1671 1353L1684 1341L1694 1327L1702 1309L1705 1295L1705 1272L1699 1249L1693 1237L1682 1222L1668 1209L1647 1197L1635 1193L1623 1191Z'],
    ['w', 'M1535 1437L1534 1444L1534 2075L1535 2076L1693 2076L1694 2075L1693 1437Z'],
    ['w', 'M2259 1469L2225 1454L2195 1444L2145 1432L2084 1425L2016 1426L1991 1429L1958 1436L1927 1446L1909 1454L1889 1465L1869 1479L1840 1508L1827 1526L1813 1555L1806 1579L1803 1598L1803 1639L1806 1658L1815 1687L1830 1715L1846 1735L1865 1753L1887 1769L1911 1783L1963 1806L2050 1835L2071 1844L2085 1852L2101 1867L2106 1875L2110 1888L2110 1903L2107 1914L2103 1922L2087 1938L2068 1947L2032 1954L1984 1954L1942 1947L1889 1932L1864 1922L1849 1914L1847 1916L1790 2040L1791 2043L1809 2051L1846 2064L1884 2074L1914 2080L1975 2087L2041 2087L2053 2085L2065 2085L2098 2080L2125 2074L2153 2065L2170 2058L2193 2046L2222 2025L2243 2003L2258 1981L2269 1957L2276 1933L2280 1900L2279 1867L2275 1845L2263 1813L2251 1793L2243 1783L2215 1756L2195 1742L2170 1728L2119 1706L2031 1675L1995 1657L1984 1649L1973 1638L1969 1632L1965 1622L1965 1604L1974 1586L1982 1578L1994 1570L2012 1563L2046 1557L2088 1557L2126 1562L2165 1571L2186 1578L2207 1587L2261 1471Z'],
    ['o', 'M2370 1473L2370 1857L2369 1858L2370 1859L2369 1860L2370 1861L2369 1862L2369 2075L2370 2076L2529 2075L2529 1584L2532 1581L2559 1571L2575 1568L2621 1568L2639 1571L2662 1578L2683 1589L2702 1606L2711 1619L2718 1637L2720 1656L2720 2076L2879 2076L2879 1598L2897 1584L2915 1575L2937 1569L2963 1568L2964 1567L2966 1568L2985 1568L3005 1572L3019 1577L3036 1587L3046 1596L3056 1608L3063 1621L3069 1640L3070 1666L3071 1667L3071 2075L3144 2075L3145 2076L3231 2076L3232 2075L3232 1760L3231 1759L3231 1611L3223 1568L3216 1548L3206 1527L3186 1498L3166 1478L3149 1465L3116 1447L3076 1434L3055 1430L3025 1427L2972 1428L2921 1436L2877 1449L2859 1456L2832 1469L2798 1491L2796 1491L2780 1478L2759 1465L2739 1455L2697 1440L2666 1433L2638 1429L2611 1428L2610 1427L2565 1427L2564 1428L2526 1430L2473 1439L2435 1449L2399 1462L2396 1462Z'],
    ['o', 'M3328 1437L3328 1852L3329 1853L3329 1882L3332 1900L3332 1908L3342 1949L3356 1981L3374 2008L3390 2025L3410 2041L3426 2051L3454 2064L3478 2072L3503 2078L3561 2085L3585 2085L3586 2086L3634 2085L3706 2078L3735 2073L3777 2063L3814 2051L3839 2040L3839 1437L3681 1437L3680 1439L3680 1939L3676 1942L3661 1947L3643 1951L3620 1954L3575 1954L3553 1950L3536 1944L3525 1938L3510 1925L3501 1913L3492 1892L3488 1870L3488 1477L3487 1476L3487 1437Z'],
    ['w', 'M1730.6 2174.8L1730.6 2568.0L1782.3 2568.0L1788.0 2569.2L1807.7 2571.3L1834.4 2572.1L1834.8 2571.7L1849.9 2571.3L1865.9 2569.2L1878.6 2566.4L1888.5 2563.1L1900.0 2557.8L1906.5 2553.7L1914.7 2547.1L1921.3 2540.1L1927.0 2531.9L1931.1 2524.1L1934.4 2515.9L1937.7 2503.2L1939.7 2488.5L1939.7 2476.6L1940.1 2476.2L1939.7 2385.6L1938.5 2378.2L1938.5 2374.9L1936.9 2367.1L1932.4 2352.8L1928.7 2345.0L1923.7 2337.2L1914.7 2326.9L1904.1 2318.7L1888.5 2310.9L1878.6 2307.7L1868.4 2305.2L1844.6 2302.3L1826.2 2301.9L1825.8 2302.3L1807.7 2302.7L1796.2 2304.0L1795.8 2303.6L1795.8 2174.8ZM1806.9 2358.1L1820.4 2356.0L1838.9 2356.0L1850.8 2358.5L1859.4 2362.6L1865.5 2367.9L1869.2 2372.8L1872.9 2381.4L1874.5 2390.5L1874.5 2483.5L1874.1 2487.2L1871.7 2496.2L1869.2 2501.2L1865.5 2506.1L1862.7 2509.0L1857.3 2512.7L1847.9 2516.3L1838.9 2518.0L1820.4 2518.0L1806.9 2515.9L1797.5 2513.1L1795.8 2511.8L1795.8 2362.2L1797.5 2360.9Z'],
    ['w', 'M1991.4 2321.2L2007.0 2372.8L2015.6 2369.6L2031.6 2364.6L2054.5 2359.3L2074.6 2356.4L2082.4 2356.4L2082.8 2356.0L2098.8 2356.4L2112.8 2358.5L2117.7 2360.1L2125.1 2364.2L2129.2 2368.3L2132.0 2372.8L2133.7 2377.3L2134.9 2384.3L2134.9 2397.0L2134.5 2397.4L2128.7 2397.4L2128.3 2397.0L2089.0 2397.4L2073.4 2399.1L2059.0 2401.5L2047.2 2404.4L2028.3 2411.0L2015.2 2417.5L2003.3 2425.7L1993.9 2434.8L1986.5 2444.6L1980.3 2456.9L1976.6 2470.4L1975.4 2481.9L1975.8 2496.7L1977.5 2506.9L1979.1 2513.1L1982.0 2520.8L1985.2 2527.4L1993.4 2538.9L1999.6 2545.0L2007.4 2551.2L2013.9 2555.3L2025.8 2561.0L2037.7 2565.1L2048.8 2568.0L2059.5 2570.1L2072.6 2571.7L2084.1 2572.1L2084.5 2572.5L2114.0 2572.5L2139.0 2570.1L2154.2 2567.6L2170.2 2563.9L2185.7 2559.0L2196.8 2554.1L2196.8 2385.1L2196.4 2384.7L2196.4 2379.0L2194.3 2365.5L2190.7 2351.9L2184.1 2338.4L2177.1 2329.0L2168.5 2320.8L2162.0 2316.3L2153.8 2311.8L2146.8 2308.9L2136.5 2305.6L2127.1 2303.6L2116.0 2301.9L2105.8 2301.5L2105.4 2301.1L2075.4 2301.5L2063.1 2302.7L2047.6 2305.2L2020.1 2311.3L2011.5 2313.8ZM2134.9 2451.2L2134.9 2515.5L2134.1 2516.3L2123.4 2519.2L2106.6 2521.3L2089.0 2521.3L2079.1 2520.0L2070.5 2518.0L2059.5 2513.5L2053.3 2509.4L2047.2 2503.2L2045.1 2500.3L2042.6 2495.0L2041.4 2490.5L2041.0 2484.4L2042.2 2476.6L2045.1 2470.4L2047.6 2467.1L2053.3 2461.8L2057.0 2459.3L2063.6 2456.1L2070.1 2453.6L2082.4 2450.7L2091.4 2449.5L2110.3 2448.7L2110.7 2449.1L2126.3 2449.5L2134.1 2450.3Z'],
    ['w', 'M2236.6 2320.8L2236.6 2568.0L2301.3 2568.0L2301.8 2567.2L2301.8 2362.2L2303.4 2360.9L2309.6 2358.9L2316.9 2357.3L2326.4 2356.0L2344.8 2356.0L2353.8 2357.7L2360.8 2360.1L2365.3 2362.6L2371.5 2367.9L2375.2 2372.8L2378.8 2381.4L2380.5 2390.5L2380.5 2551.6L2380.9 2552.0L2380.9 2568.0L2446.1 2568.0L2446.1 2397.8L2445.7 2397.4L2445.7 2385.6L2444.4 2378.2L2444.4 2374.9L2440.3 2358.1L2434.6 2345.0L2427.2 2333.9L2420.7 2326.9L2412.5 2320.4L2405.9 2316.3L2394.4 2310.9L2384.6 2307.7L2374.3 2305.2L2350.6 2302.3L2340.7 2302.3L2340.3 2301.9L2320.6 2302.3L2291.1 2305.2L2279.2 2307.2L2262.0 2311.3L2246.8 2316.3Z'],
    ['w', 'M2515.4 2245.7L2515.4 2305.6L2515.0 2306.0L2476.0 2306.0L2476.0 2360.1L2515.0 2360.1L2515.4 2360.5L2515.4 2494.6L2516.6 2504.4L2519.1 2515.1L2524.0 2527.8L2530.9 2539.3L2533.8 2543.0L2542.4 2551.6L2549.8 2556.9L2562.1 2563.1L2574.8 2566.8L2589.6 2568.8L2605.2 2568.8L2606.0 2568.4L2620.3 2511.4L2620.3 2509.8L2606.0 2508.1L2596.1 2505.7L2588.8 2501.6L2585.1 2497.9L2581.8 2491.7L2581.0 2488.5L2581.0 2479.8L2580.6 2479.4L2580.6 2360.5L2581.0 2360.1L2620.3 2360.1L2620.3 2306.0L2581.0 2306.0L2580.6 2305.6L2580.6 2245.7Z'],
    ['w', 'M2652.7 2306.0L2652.7 2476.2L2653.1 2476.6L2653.1 2488.5L2654.4 2495.8L2654.4 2499.1L2658.5 2515.9L2664.2 2529.1L2671.6 2540.1L2678.1 2547.1L2686.3 2553.7L2692.9 2557.8L2704.4 2563.1L2714.2 2566.4L2724.5 2568.8L2748.2 2571.7L2758.1 2571.7L2758.5 2572.1L2778.2 2571.7L2807.7 2568.8L2819.6 2566.8L2836.8 2562.7L2852.0 2557.8L2862.2 2553.2L2862.2 2306.0L2797.4 2306.0L2797.0 2306.8L2797.0 2511.8L2795.4 2513.1L2789.2 2515.1L2781.9 2516.8L2772.4 2518.0L2754.0 2518.0L2745.0 2516.3L2738.0 2513.9L2733.5 2511.4L2727.3 2506.1L2723.7 2501.2L2720.0 2492.6L2718.3 2483.5L2718.3 2322.4L2717.9 2322.0L2717.9 2306.0Z'],
    ['w', 'M2902.0 2174.8L2902.0 2494.6L2904.5 2510.6L2908.6 2523.3L2914.7 2535.2L2920.4 2543.0L2929.1 2551.6L2938.5 2558.2L2945.9 2561.8L2957.8 2565.9L2968.4 2568.0L2976.2 2568.8L2991.8 2568.8L2992.6 2568.4L3007.0 2511.4L3007.0 2509.8L2988.5 2507.3L2982.8 2505.7L2975.4 2501.6L2971.7 2497.9L2969.2 2493.8L2967.6 2488.5L2967.6 2479.8L2967.2 2479.4L2967.2 2175.2L2966.8 2174.8Z']
  ];
  /* Linimasa (ms) sama dengan contoh pemilik. */
  var T = { jeda: 75, gambar: 2400, isiMulai: 1300, isi: 1100, cahayaMulai: 3000, cahaya: 1700, besar: 4500 };
  var SINUS = 'cubic-bezier(.37,0,.63,1)';
  var LAMBAT = 'cubic-bezier(.16,1,.3,1)';
  var CAHAYA = 0.45;
  var KUNCI = 'lz_logo_dilihat';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function kurangi() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
  }

  function svgUtama() {
    var p = '';
    for (var i = 0; i < BAGIAN.length; i++) p += '<path class="' + BAGIAN[i][0] + '" d="' + BAGIAN[i][1] + '"/>';
    return '<svg class="lzm-main" viewBox="0 0 ' + VB_L + ' ' + VB_T + '" aria-hidden="true" focusable="false">'
      + '<g class="lzm-zoom">' + p + '</g></svg>';
  }

  /* Wadah kosong seukuran logo; isinya dipasang isi(). Dipakai app.js (applyBranding) dan markup modul. */
  function html(nama) {
    return '<span class="logo-img lz-logo-svg lz-logo-tunggu" data-lz-logo role="img" aria-label="'
      + esc(nama || 'Lazismu Bantul') + '">' + svgUtama() + '</span>';
  }

  /* Lapisan cahaya: salinan bentuk yang dikaburkan, dirender sekali; yang dianimasikan hanya opacity dan transform.
     Kaburnya sekitar 3 px di layar, dihitung dari lebar logo saat dipasang. */
  var nomor = 0;
  function pasangCahaya(el) {
    var lama = el.querySelector('.lzm-glow');
    if (lama) lama.remove();
    var lebar = el.getBoundingClientRect().width || 70;
    var std = Math.round(3 * VB_L / Math.max(30, lebar));
    var tepi = std * 3;
    var id = 'lzm-kabur-' + (++nomor);
    var g = document.createElementNS(NS, 'svg');
    g.setAttribute('class', 'lzm-glow');
    g.setAttribute('viewBox', '0 0 ' + VB_L + ' ' + VB_T);
    g.setAttribute('aria-hidden', 'true');
    g.setAttribute('focusable', 'false');
    var p = '';
    for (var i = 0; i < BAGIAN.length; i++) p += '<path d="' + BAGIAN[i][1] + '"/>';
    g.innerHTML = '<defs><filter id="' + id + '" filterUnits="userSpaceOnUse" x="' + (-tepi) + '" y="' + (-tepi)
      + '" width="' + (VB_L + 2 * tepi) + '" height="' + (VB_T + 2 * tepi) + '"><feGaussianBlur stdDeviation="' + std
      + '"/></filter></defs><g filter="url(#' + id + ')" class="lzm-glow-isi">' + p + '</g>';
    el.insertBefore(g, el.firstChild);
    el.__lzLebar = lebar;
  }

  function isi(el) {
    if (!el.querySelector('svg.lzm-main')) el.insertAdjacentHTML('beforeend', svgUtama());
  }

  /* Kembali ke logo diam: semua animasi dilepas dan gaya sebaris dibuang, jadi yang tergambar persis logo akhir. */
  function diam(el) {
    var s = el.__lz;
    el.__lz = null;
    if (s) s.anim.forEach(function (a) { try { a.cancel(); } catch (_) { /* sudah selesai */ } });
    var ps = el.querySelectorAll('.lzm-main path');
    for (var i = 0; i < ps.length; i++) {
      ps[i].removeAttribute('pathLength');
      ps[i].removeAttribute('style');
    }
    el.classList.remove('lz-logo-tunggu', 'lz-logo-gerak');
  }

  function mainkan(el) {
    diam(el);
    var lebar = el.getBoundingClientRect().width || 70;
    if (!el.querySelector('.lzm-glow') || Math.abs((el.__lzLebar || 0) - lebar) > 8) pasangCahaya(el);
    var svg = el.querySelector('svg.lzm-main');
    var zoom = svg.querySelector('.lzm-zoom');
    var cahaya = el.querySelector('.lzm-glow');
    var ps = [].slice.call(svg.querySelectorAll('path'));
    /* Garis sekitar 1,4 px di layar, berapa pun lebar logonya. */
    var garis = Math.min(160, Math.max(10, 1.4 * VB_L / Math.max(20, lebar)));
    var s = { anim: [] };
    el.__lz = s;
    /* Uji boleh mempercepat linimasa (window.__ujiLogoSkala = 0.1) supaya tidak menunggu 5 detik per menu. */
    var kali = Number(window.__ujiLogoSkala) > 0 ? Number(window.__ujiLogoSkala) : 1;
    var tambah = function (x, kf, o) {
      o.duration *= kali;
      if (o.delay) o.delay *= kali;
      var a = x.animate(kf, Object.assign({ fill: 'both' }, o));
      s.anim.push(a);
      return a;
    };
    ps.forEach(function (p, i) {
      p.setAttribute('pathLength', '1');
      p.style.strokeDasharray = '1 1';
      p.style.stroke = 'currentColor';
      p.style.strokeLinejoin = 'round';
      tambah(p, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: T.gambar, delay: i * T.jeda, easing: SINUS });
      tambah(p, [{ fillOpacity: 0, strokeOpacity: 1, strokeWidth: garis }, { fillOpacity: 1, strokeOpacity: 0, strokeWidth: 0 }],
        { duration: T.isi, delay: T.isiMulai + i * T.jeda, easing: SINUS });
    });
    if (cahaya) {
      tambah(cahaya, [{ opacity: 0.001 }, { opacity: CAHAYA }], { duration: T.cahaya, delay: T.cahayaMulai, easing: SINUS });
      tambah(cahaya, [{ transform: 'scale(.965)' }, { transform: 'scale(1)' }], { duration: T.besar, easing: LAMBAT });
    }
    tambah(zoom, [{ transform: 'scale(.965)' }, { transform: 'scale(1)' }], { duration: T.besar, easing: LAMBAT });
    el.classList.remove('lz-logo-tunggu');
    el.classList.add('lz-logo-gerak');
    Promise.all(s.anim.map(function (a) { return a.finished; })).then(function () {
      if (el.__lz === s) diam(el);
    }, function () { /* dibatalkan: diam() atau mainkan() berikutnya sudah membereskan */ });
  }

  /* ---- ukuran saat bilah ciut ------------------------------------------------------------------------------- */
  /* Bagian 55 di styles.css mengecilkan logo ke 56% saat bilah ciut, angka yang dipilih untuk logo unggahan berbentuk
     tulisan melebar (3:1). Logo ini hampir persegi (1,49:1): 56% dari 72 px tinggal 40 x 27 px dan tulisan "bantul"
     di bawahnya tidak terbaca. Di sini dipakai 78% (56 x 37 px, masih di dalam rel 84 px), dan geseran ke tengah rel
     dihitung ulang dengan rumus yang sama dengan js/lz-sisi.js: t = tengah rel - x0 - s * lebar / 2. */
  var SKALA_CIUT = 0.78;
  function ukurCiut() {
    var el = logo();
    var a = el && el.closest('.app');
    var nav = el && el.closest('.topnav');
    if (!a || !nav) return;
    el.style.setProperty('transition', 'none', 'important');
    el.style.setProperty('transform', 'none', 'important');
    var k = el.getBoundingClientRect(), kn = nav.getBoundingClientRect();
    el.style.removeProperty('transform');
    requestAnimationFrame(function () { el.style.removeProperty('transition'); });
    if (!k.width) return;
    var rel = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u-rail')) || 84;
    var t = rel / 2 - (k.left - kn.left) - SKALA_CIUT * k.width / 2;
    a.style.setProperty('--lz-logo-x-ciut', Math.round(t * 10) / 10 + 'px');
    a.style.setProperty('--lz-logo-ciut', String(SKALA_CIUT));
  }
  var jamUkur = 0;
  window.addEventListener('resize', function () { clearTimeout(jamUkur); jamUkur = setTimeout(ukurCiut, 160); }, { passive: true });

  /* ---- kapan diputar ---------------------------------------------------------------------------------------- */
  var dilihat = {};
  try { dilihat = JSON.parse(sessionStorage.getItem(KUNCI) || '{}') || {}; } catch (_) { dilihat = {}; }
  function tandai(k) {
    dilihat[k] = 1;
    try { sessionStorage.setItem(KUNCI, JSON.stringify(dilihat)); } catch (_) { /* mode privat: cukup di memori */ }
  }
  function halaman() { return location.pathname.replace(/\/index\.html$/, '/'); }
  function kunciMenu() {
    var a = document.querySelector('.topnav .tn-item.active');
    if (!a) return null;
    return halaman() + '#' + (a.id || a.getAttribute('data-menu') || a.textContent.trim());
  }
  function logo() { return document.querySelector('#brandBox .lz-logo-svg'); }

  var terakhir = null, tampak = false, cadangan = 0, diamati = null, io = null;
  function periksa() {
    var el = logo();
    if (!el) return;
    isi(el);
    amati(el);
    var k = kunciMenu();
    if (k === null) {
      /* Halaman tanpa butir menu aktif (atau belum diberi tanda): ditunggu sebentar, lalu dipakai kunci halamannya. */
      if (cadangan === 0) cadangan = setTimeout(function () { cadangan = -1; periksa(); }, 1200);
      if (cadangan !== -1) return;
      k = halaman() + '#';
    }
    if (k === terakhir) return;
    if (kurangi() || dilihat[k]) {
      /* Menu yang sudah pernah dibuka: langsung diam dan tampil, tidak perlu menunggu terlihat. Animasi menu
         sebelumnya yang masih berjalan dibiarkan selesai. */
      terakhir = k;
      if (!el.__lz) diam(el);
      return;
    }
    /* Menu baru: ditunggu sampai logonya benar-benar dilihat orang, baru diputar dan dicatat. */
    if (!tampak || !siapDilihat()) return;
    terakhir = k;
    tandai(k);
    mainkan(el);
  }

  /* IntersectionObserver tidak tahu soal opacity. Halaman utama menahan body di opacity 0 sampai huruf termuat
     (html.tunggu-huruf, paling lama 1,5 detik), dan tab di belakang tidak dilihat siapa pun: dalam dua keadaan itu
     animasi pertama dulu habis diputar tanpa penonton. Terukur di rekaman uji: 20 bingkai pertama layar masih kosong
     sementara logonya sudah setengah tergambar. */
  function siapDilihat() {
    return !document.hidden && !document.documentElement.classList.contains('tunggu-huruf');
  }

  var jadwal = 0;
  function nanti() {
    if (jadwal) return;
    jadwal = requestAnimationFrame(function () { jadwal = 0; periksa(); });
  }

  function amati(el) {
    if (diamati === el || !('IntersectionObserver' in window)) {
      if (!('IntersectionObserver' in window)) tampak = true;
      return;
    }
    if (io) io.disconnect();
    diamati = el;
    tampak = false;
    io = new IntersectionObserver(function (es) {
      var t = es.some(function (e) { return e.isIntersecting; });
      if (t && !tampak) {
        /* Logo baru terlihat (layar masuk ditutup, misalnya): jarak ke tengah panel baru bisa diukur sekarang. */
        try { if (window.LZSisi) window.LZSisi.ukurLogo(); } catch (_) { /* abaikan */ }
        ukurCiut();
      }
      tampak = t;
      if (t) nanti();
    });
    io.observe(el);
  }

  function pasang() {
    periksa();
    if (!window.MutationObserver) return;
    new MutationObserver(nanti).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', nanti);
    var nav = document.querySelector('.topnav');
    if (nav) new MutationObserver(nanti).observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pasang); else pasang();

  window.LZLogo = { html: html, mainkan: function (el) { el = el || logo(); if (el) mainkan(el); }, diam: diam, periksa: periksa };
})();
